import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

/** Build a logger writing to an in-memory buffer, mirroring `createLogger`'s redact config. */
function captureLogger() {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR } }, sink);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
  };
}

describe('logger redaction (unit)', () => {
  it('redacts an Authorization header carried under req.headers', () => {
    const { logger, lines } = captureLogger();
    logger.info({ req: { headers: { authorization: 'Bearer super-secret' } } }, 'incoming');
    expect(lines()[0]).toMatchObject({ req: { headers: { authorization: REDACT_CENSOR } } });
  });

  it('redacts a top-level password and token field', () => {
    const { logger, lines } = captureLogger();
    logger.info({ password: 'hunter2', token: 'abc', nested: { password: 'x' } }, 'login attempt');
    const line = lines()[0]!;
    expect(line.password).toBe(REDACT_CENSOR);
    expect(line.token).toBe(REDACT_CENSOR);
    expect((line.nested as Record<string, unknown>).password).toBe(REDACT_CENSOR);
  });

  it('leaves non-secret fields intact', () => {
    const { logger, lines } = captureLogger();
    logger.info({ userId: 'u1', route: '/things' }, 'ok');
    expect(lines()[0]).toMatchObject({ userId: 'u1', route: '/things' });
  });
});

describe('createLogger format (unit)', () => {
  /** Capture everything written to stdout while `fn` runs. */
  function captureStdout(fn: () => void): string {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      fn();
    } finally {
      process.stdout.write = original;
    }
    return written.join('');
  }

  it('emits one JSON object per line in json format', () => {
    const out = captureStdout(() => {
      createLogger({ level: 'info', format: 'json' }).info({ userId: 'u1' }, 'hello');
    });
    const line = JSON.parse(out.trim());
    expect(line).toMatchObject({ level: 'info', userId: 'u1', msg: 'hello' });
  });

  it('renders one human-readable line (no JSON, no trailing property block) in pretty format', () => {
    const out = captureStdout(() => {
      createLogger({ level: 'info', format: 'pretty' }).info(
        { context: 'Bootstrap' },
        'listening on :3010',
      );
    });
    expect(() => JSON.parse(out.trim())).toThrow();
    expect(out).toMatch(/INFO \[Bootstrap] listening on :3010/);
    expect(out.trimEnd()).not.toContain('\n');
  });
});
