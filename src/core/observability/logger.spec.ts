import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
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
    expect(line['password']).toBe(REDACT_CENSOR);
    expect(line['token']).toBe(REDACT_CENSOR);
    expect((line['nested'] as Record<string, unknown>)['password']).toBe(REDACT_CENSOR);
  });

  it('leaves non-secret fields intact', () => {
    const { logger, lines } = captureLogger();
    logger.info({ userId: 'u1', route: '/things' }, 'ok');
    expect(lines()[0]).toMatchObject({ userId: 'u1', route: '/things' });
  });
});
