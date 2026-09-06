import { describe, expect, it } from 'vitest';
import { formatLine } from './pretty-stream.js';

/** Strip ANSI so assertions read against the plain text. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (s: string) => s.replace(ANSI, '');

describe('pretty-stream formatLine (unit)', () => {
  it('lays out `[time] LEVEL [context] message` on a single line', () => {
    const out = plain(
      formatLine({
        level: 'info',
        time: '2026-08-30T18:41:18.157Z',
        context: 'NestFactory',
        msg: 'Starting Nest application...',
      }),
    );
    expect(out).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}] INFO \[NestFactory] Starting Nest application\.\.\.$/,
    );
  });

  it('omits the bracket group when there is no context', () => {
    const out = plain(formatLine({ level: 'warn', time: Date.now(), msg: 'heads up' }));
    expect(out).toMatch(/] WARN heads up$/);
    expect(out).not.toContain('[]');
  });

  it('maps every pino level to its display label', () => {
    const label = (level: string) =>
      plain(formatLine({ level, time: 0, msg: 'x' })).match(/] (\w+) x$/)?.[1];
    expect(label('trace')).toBe('TRACE');
    expect(label('debug')).toBe('DEBUG');
    expect(label('info')).toBe('INFO');
    expect(label('error')).toBe('ERROR');
    expect(label('fatal')).toBe('FATAL');
  });

  it('appends leftover structured fields as key=value pairs', () => {
    const out = plain(
      formatLine({
        level: 'info',
        time: 0,
        context: 'http',
        msg: 'GET /things 200',
        method: 'GET',
        status: 200,
      }),
    );
    expect(out).toContain('GET /things 200 method=GET status=200');
  });

  it('drops pino noise (pid, hostname, v) from the tail', () => {
    const out = plain(
      formatLine({ level: 'info', time: 0, msg: 'x', pid: 123, hostname: 'box', v: 1 }),
    );
    expect(out).not.toMatch(/pid|hostname/);
  });

  it('prints an indented stack trace when present', () => {
    const out = plain(
      formatLine({ level: 'error', time: 0, msg: 'boom', stack: 'Error: boom\n    at foo' }),
    );
    expect(out).toContain('\n    Error: boom\n        at foo');
  });
});
