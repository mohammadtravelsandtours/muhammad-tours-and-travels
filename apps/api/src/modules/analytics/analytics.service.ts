import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRatesService } from '../fx/fx-rates.service';

const SETTLED_BOOKING_STATUSES = ['CONFIRMED', 'TICKETED'] as const;

/**
 * Phase 8 BI: read-only aggregation over data every other module already
 * writes (bookings, hotel bookings, visas, packages, wallets, supplier
 * health, corporate approvals) — this module owns no data of its own.
 * Deliberately aggregates in JS over a bounded, recent slice of rows
 * (`RECENT_LIMIT`/`days` windows below) rather than raw SQL window
 * functions: this platform's current scale is mock/demo traffic, not a
 * real analytics warehouse, and a hand-written date-trunc query is a
 * worse risk than a bounded JS reduce in an environment where this has
 * been reviewed for correctness but never run against a live database
 * (no working `prisma`/npm toolchain in this sandbox — see
 * docs/ROADMAP.md's Phase 6 verification note). A real BI pipeline
 * (warehouse, scheduled rollups) is future work once there's real volume
 * to justify it.
 */
const RECENT_LIMIT = 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxRatesService,
  ) {}

  async getOverview() {
    const [
      bookingsByStatus,
      hotelBookingsByStatus,
      visasByStatus,
      manpowerByStatus,
      packagesCount,
      activeAgencies,
      pendingAgencies,
      suspendedAgencies,
      corporates,
      walletTotals,
      walletsByCurrencyRows,
      hotelPropertiesCount,
    ] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.hotelBooking.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.visaApplication.groupBy({ by: ['status'], _count: { _all: true } }),
      // Phase 14: the admin dashboard's "pending approvals" tile needs
      // this — Manpower shipped in Phase 13 without an analytics entry.
      this.prisma.manpowerApplication.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.travelPackage.count(),
      this.prisma.b2BAgency.count({ where: { status: 'ACTIVE' } }),
      this.prisma.b2BAgency.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.prisma.b2BAgency.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.corporate.count(),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.wallet.groupBy({ by: ['currency'], _sum: { balance: true } }),
      this.prisma.hotelProperty.count(),
    ]);

    // Revenue is summed per currency rather than blindly across all rows
    // — this platform does no FX conversion by default (see
    // TravelPolicyService's own scope note), so a single grand total
    // across mixed currencies would be a meaningless number, not a
    // simplification. grossRevenueConvertedTotal below is the opt-in
    // exception: it exists ONLY when FxRatesService is actually
    // configured, and is additive — grossRevenueByCurrency is always
    // present regardless, so nothing that reads it needs to change.
    const revenueByCurrency = new Map<string, number>();
    for (const row of await this.prisma.booking.groupBy({
      by: ['currency'],
      where: { status: { in: [...SETTLED_BOOKING_STATUSES] } },
      _sum: { totalAmount: true },
    })) {
      revenueByCurrency.set(row.currency, (revenueByCurrency.get(row.currency) ?? 0) + Number(row._sum.totalAmount ?? 0));
    }
    for (const row of await this.prisma.hotelBooking.groupBy({
      by: ['currency'],
      where: { status: { in: ['CONFIRMED', 'REFUND_PENDING', 'REFUNDED'] } }, // include cancelled-but-was-real revenue the same way a flight refund still counts as gross bookings
      _sum: { totalAmount: true },
    })) {
      revenueByCurrency.set(row.currency, (revenueByCurrency.get(row.currency) ?? 0) + Number(row._sum.totalAmount ?? 0));
    }

    // Same currency-mixing problem walletBalanceTotal below has always
    // had (see its own doc comment) — broken out per currency here too,
    // plus the same opt-in converted total.
    const walletBalanceByCurrency = new Map<string, number>();
    for (const row of walletsByCurrencyRows) {
      walletBalanceByCurrency.set(row.currency, (walletBalanceByCurrency.get(row.currency) ?? 0) + Number(row._sum.balance ?? 0));
    }

    const [grossRevenueConvertedTotal, walletBalanceConvertedTotal] = await Promise.all([
      this.convertToBaseCurrencyTotal(revenueByCurrency),
      this.convertToBaseCurrencyTotal(walletBalanceByCurrency),
    ]);

    return {
      flightBookings: bookingsByStatus.map((r) => ({ status: r.status, count: r._count._all, revenue: Number(r._sum.totalAmount ?? 0) })),
      hotelBookings: hotelBookingsByStatus.map((r) => ({ status: r.status, count: r._count._all, revenue: Number(r._sum.totalAmount ?? 0) })),
      visaApplications: visasByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      manpowerApplications: manpowerByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      packagesCount,
      hotelPropertiesCount,
      agencies: { active: activeAgencies, pendingApproval: pendingAgencies, suspended: suspendedAgencies },
      corporatesCount: corporates,
      /** @deprecated Mixed-currency sum, kept only for backward compatibility with existing dashboards — meaningless once agencies use more than one wallet currency. Prefer walletBalanceByCurrency / walletBalanceConvertedTotal. */
      walletBalanceTotal: Number(walletTotals._sum.balance ?? 0),
      walletBalanceByCurrency: Object.fromEntries(walletBalanceByCurrency),
      /** Only present when FxRatesService is configured (see .env.example's FX_RATES_JSON) — null otherwise, never a guess. */
      walletBalanceConvertedTotal,
      grossRevenueByCurrency: Object.fromEntries(revenueByCurrency),
      /** Only present when FxRatesService is configured — null otherwise. Additive alongside grossRevenueByCurrency, never a replacement for it. */
      grossRevenueConvertedTotal,
    };
  }

  /**
   * Converts every entry of a currency->amount map into FxRatesService's
   * configured base currency and sums them, skipping (not guessing) any
   * currency the current rate table has no entry for. Returns null
   * outright when FX isn't configured at all — every caller treats that
   * exactly like "this figure doesn't exist", never like zero.
   */
  private async convertToBaseCurrencyTotal(amountsByCurrency: Map<string, number>): Promise<{ baseCurrency: string; amount: number; unconvertedCurrencies: string[] } | null> {
    if (!this.fx.isConfigured()) return null;
    const baseCurrency = this.fx.baseCurrency as string;

    let total = 0;
    const unconvertedCurrencies: string[] = [];
    for (const [currency, amount] of amountsByCurrency) {
      const converted = await this.fx.convert(amount, currency, baseCurrency);
      if (converted === null) {
        unconvertedCurrencies.push(currency);
        continue;
      }
      total += converted;
    }
    return { baseCurrency, amount: round2(total), unconvertedCurrencies };
  }

  /** Daily flight-booking count + revenue for the last N days (default 30), for a simple trend chart. Zero-filled — a day with no bookings still appears as {count: 0, revenue: 0} so a chart never has to guess about a gap. */
  async getBookingsTimeSeries(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.booking.findMany({
      where: { createdAt: { gte: cutoff }, status: { in: [...SETTLED_BOOKING_STATUSES] } },
      select: { createdAt: true, totalAmount: true },
    });

    const byDay = new Map<string, { count: number; revenue: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), { count: 0, revenue: 0 });
    }
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.revenue += Number(row.totalAmount);
      }
    }
    return [...byDay.entries()]
      .map(([date, v]) => ({ date, count: v.count, revenue: round2(v.revenue) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Confirmed+ booking count/revenue by channel (B2C/B2B/CORPORATE) — currency-mixed within a channel, so this is a count-first view; see getOverview for the currency-split revenue total. */
  async getRevenueByChannel() {
    const rows = await this.prisma.booking.groupBy({
      by: ['channel'],
      where: { status: { in: [...SETTLED_BOOKING_STATUSES] } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    return rows.map((r) => ({ channel: r.channel, count: r._count._all, revenueMixedCurrency: round2(Number(r._sum.totalAmount ?? 0)) }));
  }

  /** Top origin-destination pairs by confirmed+ booking count, over the most recent RECENT_LIMIT settled bookings. "Route" is the first segment's origin to the last segment's destination — the overall itinerary, not each individual leg. */
  async getTopRoutes(limit = 10) {
    const bookings = await this.prisma.booking.findMany({
      where: { status: { in: [...SETTLED_BOOKING_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: { offer: { select: { segments: { orderBy: { sequence: 'asc' }, select: { origin: true, destination: true } } } } },
    });

    const counts = new Map<string, number>();
    for (const booking of bookings) {
      const segments = booking.offer?.segments ?? [];
      if (segments.length === 0) continue;
      const route = `${segments[0].origin}-${segments[segments.length - 1].destination}`;
      counts.set(route, (counts.get(route) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /** Current SupplierHealth snapshot per registered supplier — same rows the search orchestrator writes after every search. */
  async getSupplierHealth() {
    const rows = await this.prisma.supplierHealth.findMany({ include: { supplier: { select: { code: true, name: true, active: true } } } });
    return rows.map((r) => ({
      supplierCode: r.supplier.code,
      supplierName: r.supplier.name,
      active: r.supplier.active,
      status: r.status,
      avgResponseMs: r.avgResponseMs,
      consecutiveErrors: r.consecutiveErrors,
      lastSuccessAt: r.lastSuccessAt,
      lastErrorAt: r.lastErrorAt,
      lastErrorMessage: r.lastErrorMessage,
    }));
  }

  /** How often a CORPORATE booking needed a human approver vs. was auto-approved by the travel policy engine — see TravelPolicyService.evaluate/BookingsService.createBooking. */
  async getCorporatePolicyStats() {
    const rows = await this.prisma.corporateApproval.groupBy({ by: ['status'], _count: { _all: true } });
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const autoApproved = await this.prisma.corporateApproval.count({ where: { status: 'APPROVED', approverUserId: null } });
    return {
      byStatus: rows.map((r) => ({ status: r.status, count: r._count._all })),
      total,
      autoApprovedByPolicy: autoApproved,
      decidedByHuman: total - autoApproved,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
