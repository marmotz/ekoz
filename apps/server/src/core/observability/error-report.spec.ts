import { describe, expect, it, vi } from 'vitest';
import {
  createFatalReporter,
  describeError,
  formatErrorReport,
  isDebugRequested,
  summarizeError,
} from './error-report.js';

const ESC = String.fromCharCode(27);

class StructuredError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fix = '',
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

class SqlConnectionError extends Error {}

/** Mirrors the real chain: structured error > empty driver wrapper > network error. */
function connectionRefused(): Error {
  const leaf = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });

  return new StructuredError(
    'Database error while reading marker',
    'CONTRACT.MARKER_READ_FAILED',
    'Verify connectivity.',
    { cause: new SqlConnectionError('', { cause: leaf }) },
  );
}

describe('describeError (unit)', () => {
  it('uses the outermost message as headline and keeps its code', () => {
    const report = describeError(connectionRefused());
    expect(report.headline).toBe('Database error while reading marker');
    expect(report.code).toBe('CONTRACT.MARKER_READ_FAILED');
  });

  it('drops wrapper errors that carry no message, code, why or fix', () => {
    const report = describeError(connectionRefused());
    expect(report.chain.map((link) => link.name)).toEqual(['StructuredError', 'Error']);
  });

  it('flattens AggregateError members and collapses duplicates', () => {
    const one = new Error('connect ECONNREFUSED ::1:5432');
    const twin = new Error('connect ECONNREFUSED ::1:5432');
    const report = describeError(new AggregateError([one, twin], 'all failed'));
    expect(report.chain.map((link) => link.message)).toEqual([
      'all failed',
      'connect ECONNREFUSED ::1:5432',
    ]);
  });

  it('survives a cyclic cause chain', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    Object.assign(a, { cause: b });
    expect(describeError(a).chain).toHaveLength(2);
  });

  it('handles non-Error throwables', () => {
    expect(describeError('plain string').headline).toBe('plain string');
    expect(describeError(undefined).headline).toBe('undefined');
  });

  it('suggests starting the database on a refused connection', () => {
    expect(describeError(connectionRefused()).hint).toMatch(/PostgreSQL is running/);
  });

  it('suggests migrating on a contract error without a network cause', () => {
    const error = new StructuredError('Schema is behind', 'CONTRACT.MARKER_MISMATCH');
    expect(describeError(error).hint).toMatch(/db:migrate/);
  });

  it('gives no hint when nothing is recognised', () => {
    expect(describeError(new Error('boom')).hint).toBeUndefined();
  });
});

describe('summarizeError (unit)', () => {
  it('renders headline, code and causes on one line', () => {
    expect(summarizeError(connectionRefused())).toBe(
      'Database error while reading marker [CONTRACT.MARKER_READ_FAILED] (caused by: connect ECONNREFUSED 127.0.0.1:5432)',
    );
  });

  it('is just the message for a plain error', () => {
    expect(summarizeError(new Error('boom'))).toBe('boom');
  });
});

describe('formatErrorReport (unit)', () => {
  it('lays out title, headline, fix, causes and hint without ANSI when colour is off', () => {
    const text = formatErrorReport(connectionRefused(), { title: 'Ekoz server failed to start' });
    expect(text).toContain('x Ekoz server failed to start');
    expect(text).toContain('Database error while reading marker [CONTRACT.MARKER_READ_FAILED]');
    expect(text).toContain('Fix: Verify connectivity.');
    expect(text).toContain('Caused by:');
    expect(text).toContain('connect ECONNREFUSED 127.0.0.1:5432 [ECONNREFUSED]');
    expect(text).toContain('Hint:');
    expect(text).not.toContain(ESC);
  });

  it('adds the stack only when asked, otherwise explains how to get it', () => {
    const error = new Error('boom');
    const quiet = formatErrorReport(error, { title: 't' });
    expect(quiet).toContain('OBSERVABILITY_LOG_LEVEL=debug');
    expect(quiet).not.toMatch(/\n\s+at /);

    const verbose = formatErrorReport(error, { title: 't', includeStack: true });
    expect(verbose).not.toContain('OBSERVABILITY_LOG_LEVEL=debug');
    expect(verbose).toMatch(/\n\s+at /);
  });

  it('paints when colour is on', () => {
    expect(formatErrorReport(new Error('boom'), { title: 't', color: true })).toContain(ESC);
  });
});

describe('isDebugRequested (unit)', () => {
  it('reads either log-level variable', () => {
    expect(isDebugRequested({ OBSERVABILITY_LOG_LEVEL: 'debug' })).toBe(true);
    expect(isDebugRequested({ EKOZ_OBSERVABILITY__LOG_LEVEL: 'trace' })).toBe(true);
    expect(isDebugRequested({ OBSERVABILITY_LOG_LEVEL: 'info' })).toBe(false);
    expect(isDebugRequested({})).toBe(false);
  });
});

describe('createFatalReporter (unit)', () => {
  it('prints once and exits 1 even when several failures arrive', () => {
    const write = vi.fn();
    const exit = vi.fn();
    const report = createFatalReporter({ write, exit, env: {}, color: false, title: 'Crashed' });

    report(new Error('first'));
    report(new Error('second'));

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain('first');
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
