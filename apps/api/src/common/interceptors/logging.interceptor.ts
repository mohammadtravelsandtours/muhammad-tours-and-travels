import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Structured (JSON-shaped) request logging: one line per request with
 * correlation ID, method, path, status, duration, and the authenticated
 * user if any. Deliberately does not log request/response bodies —
 * those may contain passenger PII or payment data (see SECURITY.md).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { correlationId?: string; user?: { id: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        this.logger.log(
          JSON.stringify({
            requestId: req.correlationId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            userId: req.user?.id ?? null,
          }),
        );
      }),
    );
  }
}
