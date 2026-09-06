import { Injectable, type LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';
import { getRequestContext } from '../http/request-context.js';
import { createLogger, type LogFormat, type LogLevel } from './logger.js';

/**
 * Adapts the `pino` root logger to Nest's `LoggerService` so
 * `app.useLogger(...)` routes framework logs through the same pipeline as
 * application logs (ADR 0020).
 *
 * Every line is enriched from the `AsyncLocalStorage` request context
 * (technical.md §10): `requestId` (or `jobId`) within a request / job, `userId`
 * once authenticated.
 */
@Injectable()
export class NestLoggerService implements LoggerService {
  private logger: Logger;

  constructor() {
    // Bootstrap default, used only for the window before `main.ts` calls
    // `reconfigure()` with the resolved `observability.*` config (and, with
    // `bufferLogs`, only if that call never happens). `OBSERVABILITY_LOG_LEVEL` /
    // `OBSERVABILITY_LOG_FORMAT` give a last-resort override for that window.
    this.logger = createLogger({
      level: (process.env.OBSERVABILITY_LOG_LEVEL as LogLevel | undefined) ?? 'info',
      format: (process.env.OBSERVABILITY_LOG_FORMAT as LogFormat | undefined) ?? 'json',
    });
  }

  /** Rebuild the underlying logger from the resolved `observability.*` config. */
  reconfigure(options: { level?: LogLevel; format?: LogFormat }): void {
    this.logger = createLogger(options);
  }

  /** The underlying `pino` instance, for feature code that wants a child logger. */
  get pino(): Logger {
    return this.logger;
  }

  private bindings(context?: string): Record<string, unknown> {
    const ctx = getRequestContext();
    const fields: Record<string, unknown> = {};
    if (context) {
      fields.context = context;
    }

    if (ctx?.jobId) {
      fields.jobId = ctx.jobId;
    } else if (ctx?.requestId) {
      fields.requestId = ctx.requestId;
    }

    if (ctx?.userId) {
      fields.userId = ctx.userId;
    }

    return fields;
  }

  log(message: unknown, context?: string): void {
    this.logger.info(this.bindings(context), String(message));
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    this.logger.error(
      { ...this.bindings(context ?? stackOrContext), stack: context ? stackOrContext : undefined },
      String(message),
    );
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.bindings(context), String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.bindings(context), String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.bindings(context), String(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal(this.bindings(context), String(message));
  }
}
