import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Single error envelope for every response — never a raw stack trace or
 * a passed-through supplier/database error. See API.md § Conventions.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = isHttpException ? exception.getResponse() : null;

    const message =
      isHttpException && typeof response === 'object' && response !== null && 'message' in response
        ? (response as { message: string | string[] }).message
        : isHttpException
          ? exception.message
          : 'Internal server error';

    if (!isHttpException) {
      // Unexpected errors are logged with full detail server-side only.
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    res.status(status).json({
      code: isHttpException ? exception.constructor.name : 'INTERNAL_ERROR',
      message,
      requestId: req.correlationId ?? null,
    });
  }
}
