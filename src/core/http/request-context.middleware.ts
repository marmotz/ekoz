import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestContext, type RequestContext } from './request-context.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Opens the per-request `AsyncLocalStorage` context (technical.md §10) and runs
 * the rest of the request inside it. Accepts an inbound `X-Request-Id`, echoes
 * it (or a generated one) on the response, and records the client IP.
 *
 * Registered first (in `HttpModule`) so guards, pipes, interceptors and handlers
 * all see the context.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[REQUEST_ID_HEADER];
    const requestId = normalizeRequestId(inbound) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const context: RequestContext = {
      requestId,
      clientIp: req.ip ?? req.socket.remoteAddress ?? undefined,
    };

    runWithRequestContext(context, () => next());
  }
}

/** Accept a single, reasonably-sized token; ignore arrays and junk. */
function normalizeRequestId(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    return undefined;
  }

  return trimmed;
}
