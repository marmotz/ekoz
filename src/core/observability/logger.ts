import { pino, type Logger, type LoggerOptions } from 'pino';
import { createPrettyStream } from './pretty-stream.js';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogFormat = 'json' | 'pretty';

export interface CreateLoggerOptions {
  /** Minimum level (`observability.log_level`). */
  readonly level?: LogLevel;
  /**
   * `json` (default) writes one object per line to stdout — the operator's platform collects it.
   *
   * `pretty` renders one compact, colourised line per event through
   * {@link createPrettyStream} and is meant for local dev only (ADR 0020).
   */
  readonly format?: LogFormat;
}

/**
 * The single `pino` factory (ADR 0020, technical.md §11). One logger is built
 * here and injected as the Nest logger; feature code takes child loggers off it.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const base: LoggerOptions = {
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if ((options.format ?? 'json') === 'pretty') {
    return pino(base, createPrettyStream());
  }

  return pino(base);
}
