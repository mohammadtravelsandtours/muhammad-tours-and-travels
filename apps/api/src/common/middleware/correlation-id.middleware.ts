import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-request-id';

/**
 * Every request gets a correlation ID — generated if the caller didn't
 * send one — attached to the request object, echoed back in the response
 * header, and picked up by the logging interceptor. This is what makes a
 * multi-supplier parallel-call system debuggable in production; see
 * OBSERVABILITY in docs/ARCHITECTURE.md.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : uuidv4();
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
