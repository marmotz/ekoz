import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../test-support/fetch-mock.js';
import {
  AccountSuspendedError,
  AuthenticationError,
  EkozError,
  InvalidCredentialsError,
  NotFoundError,
  RateLimitError,
  RefreshReuseError,
  ServerError,
  ValidationError,
} from './errors.js';
import { decodeProblem, parseRetryAfter, toNetworkError } from './problem.js';

const SENT_ID = 'sent-request-id';

describe('decodeProblem', () => {
  it('maps each stable code to its error class', async () => {
    const cases: Array<[string, number, new (...a: any[]) => EkozError]> = [
      ['auth.invalid_credentials', 401, InvalidCredentialsError],
      ['auth.refresh_reuse', 401, RefreshReuseError],
      ['auth.unauthenticated', 401, AuthenticationError],
      ['identity.account_suspended', 403, AccountSuspendedError],
      ['validation_failed', 422, ValidationError],
    ];

    for (const [code, status, ExpectedClass] of cases) {
      const error = await decodeProblem(
        jsonResponse({ status, body: { code, status, title: code } }),
        SENT_ID,
      );
      expect(error).toBeInstanceOf(ExpectedClass);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
    }
  });

  it('falls back to a generic EkozError for an unknown code, keeping it raw', async () => {
    const error = await decodeProblem(
      jsonResponse({
        status: 418,
        body: { code: 'identity.brand_new_code', status: 418 },
      }),
      SENT_ID,
    );
    expect(error).toBeInstanceOf(EkozError);
    expect(error.constructor).toBe(EkozError);
    expect(error.code).toBe('identity.brand_new_code');
  });

  it('maps bare 404 to NotFoundError', async () => {
    const error = await decodeProblem(jsonResponse({ status: 404 }), SENT_ID);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('reads Retry-After on 429', async () => {
    const error = await decodeProblem(
      jsonResponse({
        status: 429,
        body: { code: 'auth.too_many_requests', status: 429 },
        headers: { 'Retry-After': '42' },
      }),
      SENT_ID,
    );
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(42);
  });

  it('maps 500 to ServerError without leaking server detail', async () => {
    const error = await decodeProblem(
      jsonResponse({
        status: 500,
        body: {
          code: 'internal_error',
          status: 500,
          detail: 'NPE at UserService.java:512',
        },
      }),
      SENT_ID,
    );
    expect(error).toBeInstanceOf(ServerError);
    expect(error.detail).toBeUndefined();
    expect(error.message).not.toContain('UserService');
  });

  it('extracts validation issues from an array body', async () => {
    const error = (await decodeProblem(
      jsonResponse({
        status: 422,
        body: {
          code: 'validation_failed',
          status: 422,
          errors: [{ path: 'email', message: 'invalid' }],
        },
      }),
      SENT_ID,
    )) as ValidationError;
    expect(error.issues).toEqual([{ path: 'email', message: 'invalid' }]);
  });

  it('uses the server requestId, then the response header, then the sent id', async () => {
    const fromBody = await decodeProblem(
      jsonResponse({ status: 400, body: { code: 'x', requestId: 'body-id' } }),
      SENT_ID,
    );
    expect(fromBody.requestId).toBe('body-id');

    const fromHeader = await decodeProblem(
      jsonResponse({
        status: 400,
        body: { code: 'x' },
        headers: { 'X-Request-Id': 'header-id' },
      }),
      SENT_ID,
    );
    expect(fromHeader.requestId).toBe('header-id');

    const fromSent = await decodeProblem(
      jsonResponse({ status: 400, body: { code: 'x' } }),
      SENT_ID,
    );
    expect(fromSent.requestId).toBe(SENT_ID);
  });

  it('tolerates a non-JSON error body', async () => {
    const error = await decodeProblem(
      jsonResponse({ status: 503, raw: '<html>gateway</html>' }),
      SENT_ID,
    );
    expect(error).toBeInstanceOf(ServerError);
  });
});

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('parses an HTTP-date into seconds from now', () => {
    const future = new Date(Date.now() + 30_000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThanOrEqual(28);
    expect(parseRetryAfter(future)).toBeLessThanOrEqual(31);
  });

  it('returns undefined for null or garbage', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('toNetworkError', () => {
  it('wraps a thrown fetch failure', () => {
    const error = toNetworkError(new TypeError('Failed to fetch'), SENT_ID);
    expect(error.status).toBe(0);
    expect(error.requestId).toBe(SENT_ID);
    expect(error.detail).toBe('Failed to fetch');
  });
});
