import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { getRequestContext } from '../http/request-context.js';
import { MetricsService } from './metrics.service.js';
import { NestLoggerService } from './nest-logger.service.js';

/** Scrape / probe endpoints are excluded to keep the access log signal clean (ADR 0020). */
const EXCLUDED_PATHS = new Set(['/healthz', '/readyz', '/metrics']);

/**
 * Emits exactly one structured line per completed HTTP request — method, matched
 * route, status, duration ms, `requestId`, `userId` when authenticated
 * (technical.md §11) — and feeds the baseline HTTP metrics. `/healthz`,
 * `/readyz`, `/metrics` are excluded from both.
 *
 * The line is written on the response `finish` event so it carries the final
 * status the exception filter produced, not the pre-filter status.
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: NestLoggerService,
    @Optional() private readonly metrics: MetricsService | null = null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (EXCLUDED_PATHS.has(req.path)) {
      return next.handle();
    }

    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();
    const ctx = getRequestContext();

    res.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

      this.logger.pino.info(
        {
          context: 'http',
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: Math.round(durationSeconds * 1e6) / 1e3,
          requestId: ctx?.requestId,
          userId: ctx?.userId,
        },
        `${req.method} ${route} ${res.statusCode}`,
      );

      this.metrics?.recordHttpRequest({ route, status_class: statusClass }, durationSeconds);
    });

    return next.handle();
  }
}
