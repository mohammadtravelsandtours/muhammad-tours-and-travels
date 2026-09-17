import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Records the two "golden signal" HTTP series every real deployment
 * needs — request count and request duration, both labeled by method,
 * matched ROUTE (never the raw URL, which would blow up cardinality
 * with e.g. one series per booking id) and status code — into
 * MetricsService, which MetricsController then exposes at GET /metrics.
 *
 * Registered globally (see MetricsModule) alongside LoggingInterceptor,
 * not instead of it — this feeds a time-series scrape, that feeds a log
 * line; both are needed and they don't overlap.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    const record = () => {
      // req.route is only populated once Express has matched a route,
      // which is true by the time this fires (after the handler runs) —
      // falls back to "unmatched" for a 404 that never reached a route.
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.incrementCounter('http_requests_total', labels);
      this.metrics.observeHistogram('http_request_duration_seconds', { method: req.method, route }, durationSeconds);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
