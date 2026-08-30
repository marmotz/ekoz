import { describe, expect, it } from 'vitest';
import {
  getRequestContext,
  getRequestId,
  runWithRequestContext,
  setAuthenticatedPrincipal,
} from './request-context.js';

describe('request context (unit)', () => {
  it('exposes the context only inside the run scope', () => {
    expect(getRequestContext()).toBeUndefined();

    runWithRequestContext({ requestId: 'req-1', clientIp: '10.0.0.1' }, () => {
      expect(getRequestContext()?.requestId).toBe('req-1');
      expect(getRequestId()).toBe('req-1');
    });

    expect(getRequestContext()).toBeUndefined();
  });

  it('prefers jobId over requestId for the correlation id', () => {
    runWithRequestContext({ requestId: 'req-2', jobId: 'job-9' }, () => {
      expect(getRequestId()).toBe('job-9');
    });
  });

  it('lets the auth guard attach the principal to the live context', () => {
    runWithRequestContext({ requestId: 'req-3' }, () => {
      setAuthenticatedPrincipal({ userId: 'user-7', sessionId: 'sess-1' });
      expect(getRequestContext()?.userId).toBe('user-7');
      expect(getRequestContext()?.sessionId).toBe('sess-1');
    });
  });

  it('is a no-op to attach a principal with no ambient context', () => {
    expect(() => setAuthenticatedPrincipal({ userId: 'x' })).not.toThrow();
  });

  it('keeps sibling async flows isolated', async () => {
    const seen: Array<string | undefined> = [];
    await Promise.all([
      runWithRequestContext({ requestId: 'a' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getRequestId());
      }),
      runWithRequestContext({ requestId: 'b' }, async () => {
        seen.push(getRequestId());
      }),
    ]);
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});
