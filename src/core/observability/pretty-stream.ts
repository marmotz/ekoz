import { Writable } from 'node:stream';

/**
 * Dev-only human-readable log renderer (ADR 0020). `createLogger({ format:
 * 'pretty' })` pipes `pino`'s JSON output through this stream, which prints one
 * compact, colourised line per event:
 *
 *   [2026-08-30 20:41:18.157] INFO [Bootstrap] Ekoz server listening ...
 *
 * `pino` still owns levels, timestamps and redaction upstream — this only
 * reshapes the already-serialised line. `json` is the format everywhere else.
 *
 * Kept in-house on purpose: `pino-pretty` renders as `LEVEL: message` (the colon
 * is not configurable) and, as a worker `transport`, fails silently under Bun.
 */

/**
 * Level label → display label + ANSI colour. `createLogger` configures pino to
 * emit the level as its lower-case string (`"info"`), not the numeric code.
 */
const LEVELS: Record<string, { label: string; color: string }> = {
  trace: { label: 'TRACE', color: '90' }, // bright black / grey
  debug: { label: 'DEBUG', color: '34' }, // blue
  info: { label: 'INFO', color: '32' }, // green
  warn: { label: 'WARN', color: '33' }, // yellow
  error: { label: 'ERROR', color: '31' }, // red
  fatal: { label: 'FATAL', color: '35' }, // magenta
};

/** Keys rendered in dedicated positions or pure noise — never in the tail. */
const OMITTED_KEYS = new Set(['level', 'time', 'msg', 'context', 'pid', 'hostname', 'stack', 'v']);

const useColor = Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'];

function paint(code: string, text: string): string {
  return useColor ? `[${code}m${text}[0m` : text;
}

/**
 * ISO / epoch timestamp → `YYYY-MM-DD HH:mm:ss.SSS` in local time. No timezone
 * offset: this format is dev-only, on the developer's own machine.
 */
function formatTime(value: unknown): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const pad = (n: number, width = 2) => String(n).padStart(width, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

/** Trailing ` key=value` pairs for whatever structured fields remain. */
function formatExtras(log: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(log)) {
    if (OMITTED_KEYS.has(key) || value === undefined) {
      continue;
    }

    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    parts.push(paint('90', `${key}=`) + rendered);
  }

  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/** Format a single parsed log record into its final display line(s). */
export function formatLine(log: Record<string, unknown>): string {
  const level = LEVELS[String(log['level'])] ?? { label: String(log['level'] ?? '?').toUpperCase(), color: '37' };
  const time = paint('90', `[${formatTime(log['time'])}]`);
  const label = paint(level.color, level.label);
  const context = log['context'] ? ` ${paint('36', `[${String(log['context'])}]`)}` : '';
  const message = log['msg'] === undefined ? '' : ` ${String(log['msg'])}`;

  let line = `${time} ${label}${context}${message}${formatExtras(log)}`;

  if (typeof log['stack'] === 'string') {
    line += `\n${(log['stack'] as string).replace(/^/gm, '    ')}`;
  }

  return line;
}

/** A `pino` destination stream that prints {@link formatLine} to stdout. */
export function createPrettyStream(): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const raw = chunk.toString().trimEnd();
      for (const entry of raw.split('\n')) {
        if (!entry) {
          continue;
        }

        try {
          process.stdout.write(`${formatLine(JSON.parse(entry) as Record<string, unknown>)}\n`);
        } catch {
          // Not a JSON line pino produced — pass it through untouched.
          process.stdout.write(`${entry}\n`);
        }
      }

      callback();
    },
  });
}
