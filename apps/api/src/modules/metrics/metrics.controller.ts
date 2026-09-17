import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape target — see infra/monitoring/prometheus.yml, which
 * points a Prometheus instance at this path, and
 * infra/monitoring/alert-rules.yml, which alerts off exactly the series
 * rendered here.
 *
 * Deliberately unauthenticated (same posture as HealthController, and
 * for the same reason — a Prometheus scraper has no user session to
 * present) and exempt from the global rate limiter. Unlike
 * HealthController, this endpoint is NOT safe to expose publicly on the
 * internet as-is: it reveals booking/payment volume and supplier health,
 * which is operationally sensitive even though it contains no PII or
 * financial figures. Production deployments MUST put this path behind a
 * network boundary a public client can't reach (an internal-only
 * ingress rule, a sidecar, or a separate internal port) — see
 * docs/OPERATIONS.md's "Monitoring & alerting" section.
 */
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async render(): Promise<string> {
    const gaugeLines = await this.buildGaugeLines();
    return this.metrics.render(gaugeLines);
  }

  /**
   * Point-in-time gauges computed fresh on every scrape rather than
   * accumulated in MetricsService — "current supplier health" and
   * "bookings by status right now" are facts about the database's
   * current state, not counters that only ever go up.
   */
  private async buildGaugeLines(): Promise<string[]> {
    const lines: string[] = [];

    try {
      const supplierHealthRows = await this.prisma.supplierHealth.findMany({
        include: { supplier: { select: { code: true, active: true } } },
      });
      lines.push('# HELP supplier_health_up 1 if the supplier\'s last known status is ONLINE, 0 otherwise (DEGRADED/OFFLINE/AUTH_ERROR/TIMEOUT/UNKNOWN).');
      lines.push('# TYPE supplier_health_up gauge');
      for (const row of supplierHealthRows) {
        const up = row.status === 'ONLINE' ? 1 : 0;
        lines.push(`supplier_health_up{supplier_code="${row.supplier.code}",active="${row.supplier.active}"} ${up}`);
      }

      lines.push('# HELP supplier_health_consecutive_errors Consecutive failed calls recorded for this supplier since its last success.');
      lines.push('# TYPE supplier_health_consecutive_errors gauge');
      for (const row of supplierHealthRows) {
        lines.push(`supplier_health_consecutive_errors{supplier_code="${row.supplier.code}"} ${row.consecutiveErrors}`);
      }
    } catch {
      // A metrics scrape must never 500 because the DB had a hiccup —
      // Prometheus already treats a missing series/failed scrape as its
      // own signal (`up == 0`); this endpoint just omits what it
      // couldn't compute rather than failing the whole response.
    }

    try {
      const bookingCounts = await this.prisma.booking.groupBy({ by: ['status'], _count: { _all: true } });
      lines.push('# HELP bookings_by_status Current count of bookings in each status.');
      lines.push('# TYPE bookings_by_status gauge');
      for (const row of bookingCounts) {
        lines.push(`bookings_by_status{status="${row.status}"} ${row._count._all}`);
      }
    } catch {
      // See above.
    }

    try {
      const paymentCounts = await this.prisma.payment.groupBy({ by: ['status'], _count: { _all: true } });
      lines.push('# HELP payments_by_status Current count of payment records in each status.');
      lines.push('# TYPE payments_by_status gauge');
      for (const row of paymentCounts) {
        lines.push(`payments_by_status{status="${row.status}"} ${row._count._all}`);
      }
    } catch {
      // See above.
    }

    return lines;
  }
}
