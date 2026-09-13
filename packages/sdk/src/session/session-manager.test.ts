import { describe, expect, it, vi } from 'vitest';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { SessionEventEmitter } from './events.js';
import { type AuthBundle, SessionManager } from './session-manager.js';
import { memoryStore } from './session-store.js';

function manager(fetchImpl: typeof fetch) {
  const httpClient = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const emitter = new SessionEventEmitter();
  const store = memoryStore();
  const sessionManager = new SessionManager({ httpClient, emitter, store });
  return { sessionManager, emitter, store };
}

const bundle: AuthBundle = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  sessionId: 'session-1',
  identifier: 'alice/example.com',
};

describe('SessionManager', () => {
  it('establishes a session and persists it to the store', async () => {
    const { sessionManager, emitter, store } = manager(createFetchMock());
    const authenticated = vi.fn();
    emitter.on('session:authenticated', authenticated);

    await sessionManager.establish(bundle);

    expect(sessionManager.accessToken).toBe('access-1');
    expect(await store.load()).toEqual({
      refreshToken: 'refresh-1',
      sessionId: 'session-1',
      identifier: 'alice/example.com',
    });
    expect(authenticated).toHaveBeenCalledWith({
      identifier: 'alice/example.com',
      sessionId: 'session-1',
    });
  });

  it('refreshes once and replays the original request on auth.unauthenticated', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.unauthenticated', status: 401 } }),
      jsonResponse({
        body: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
      }),
      jsonResponse({ body: { ok: true } }),
    );
    const { sessionManager } = manager(fetchMock);
    await sessionManager.establish(bundle);

    const result = await sessionManager.request('GET', '/me');

    expect(result).toEqual({ ok: true });
    expect(fetchMock.callCount).toBe(3);
    expect(fetchMock.calls[1]?.url).toBe('https://api.example.com/auth/refresh');
    expect(sessionManager.accessToken).toBe('access-2');
  });

  it('single-flights concurrent refreshes: N concurrent 401s trigger one refresh call', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.unauthenticated', status: 401 } }),
      jsonResponse({ status: 401, body: { code: 'auth.unauthenticated', status: 401 } }),
      jsonResponse({
        body: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
      }),
      jsonResponse({ body: { first: true } }),
      jsonResponse({ body: { second: true } }),
    );
    const { sessionManager } = manager(fetchMock);
    await sessionManager.establish(bundle);

    const [first, second] = await Promise.all([
      sessionManager.request('GET', '/one'),
      sessionManager.request('GET', '/two'),
    ]);

    expect(first).toEqual({ first: true });
    expect(second).toEqual({ second: true });
    const refreshCalls = fetchMock.calls.filter((c) => c.url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and emits session:invalid on refresh reuse', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.unauthenticated', status: 401 } }),
      jsonResponse({ status: 401, body: { code: 'auth.refresh_reuse', status: 401 } }),
    );
    const { sessionManager, emitter, store } = manager(fetchMock);
    await sessionManager.establish(bundle);

    const invalid = vi.fn();
    const cleared = vi.fn();
    emitter.on('session:invalid', invalid);
    emitter.on('session:cleared', cleared);

    await expect(sessionManager.request('GET', '/me')).rejects.toMatchObject({
      code: 'auth.refresh_reuse',
    });

    expect(invalid).toHaveBeenCalledWith({ reason: 'refresh_reuse' });
    expect(cleared).toHaveBeenCalledWith({});
    expect(sessionManager.accessToken).toBeUndefined();
    expect(await store.load()).toBeNull();
  });

  it('does not attempt a refresh on auth.invalid_credentials', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.invalid_credentials', status: 401 } }),
    );
    const { sessionManager } = manager(fetchMock);
    await sessionManager.establish(bundle);

    await expect(sessionManager.request('GET', '/me')).rejects.toMatchObject({
      code: 'auth.invalid_credentials',
    });
    expect(fetchMock.callCount).toBe(1);
  });

  it('emits session:invalid on identity.account_suspended without attempting a refresh', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 403, body: { code: 'identity.account_suspended', status: 403 } }),
    );
    const { sessionManager, emitter } = manager(fetchMock);
    await sessionManager.establish(bundle);

    const invalid = vi.fn();
    emitter.on('session:invalid', invalid);

    await expect(sessionManager.request('GET', '/me')).rejects.toMatchObject({
      code: 'identity.account_suspended',
    });
    expect(invalid).toHaveBeenCalledWith({ reason: 'account_suspended' });
    expect(fetchMock.callCount).toBe(1);
  });

  it('resumes cold from the store and mints a fresh access token', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
      }),
    );
    const { sessionManager, store } = manager(fetchMock);
    await store.save({
      refreshToken: 'refresh-1',
      sessionId: 'session-1',
      identifier: 'alice/example.com',
    });

    await sessionManager.resume();

    expect(sessionManager.accessToken).toBe('access-2');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/auth/refresh');
  });

  it('leaves the client unauthenticated (no throw) when a cold resume fails', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.refresh_invalid', status: 401 } }),
    );
    const { sessionManager, emitter, store } = manager(fetchMock);
    await store.save({
      refreshToken: 'stale',
      sessionId: 'session-1',
      identifier: 'alice/example.com',
    });

    const invalid = vi.fn();
    emitter.on('session:invalid', invalid);

    await expect(sessionManager.resume()).resolves.toBeUndefined();
    expect(invalid).toHaveBeenCalledWith({ reason: 'refresh_failed' });
    expect(sessionManager.accessToken).toBeUndefined();
  });

  it('lazily mounts cold state from the store on the first authenticated call, with no explicit resume()', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
      }),
      jsonResponse({ body: { ok: true } }),
    );
    const { sessionManager, store } = manager(fetchMock);
    await store.save({
      refreshToken: 'refresh-1',
      sessionId: 'session-1',
      identifier: 'alice/example.com',
    });

    const result = await sessionManager.request('GET', '/me');

    expect(result).toEqual({ ok: true });
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/auth/refresh');
    expect(sessionManager.accessToken).toBe('access-2');
  });

  it('logout clears local state even when the network call fails', async () => {
    const fetchMock = createFetchMock(new TypeError('offline'));
    const { sessionManager, emitter, store } = manager(fetchMock);
    await sessionManager.establish(bundle);

    const invalid = vi.fn();
    emitter.on('session:invalid', invalid);

    await sessionManager.logout();

    expect(invalid).toHaveBeenCalledWith({ reason: 'logout' });
    expect(sessionManager.accessToken).toBeUndefined();
    expect(await store.load()).toBeNull();
  });
});
