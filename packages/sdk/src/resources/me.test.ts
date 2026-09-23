import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createMeResource } from './me.js';

async function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  await session.establish({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'alice/example.com',
  });
  return { me: createMeResource(session), session };
}

describe('me resource', () => {
  it('get() hits GET /me with the bearer token', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'u1' } }));
    const { me } = await resource(fetchMock);

    await me.get();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me');
    expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Authorization')).toBe('Bearer a');
  });

  it('updateProfile PATCHes /me/profile with the body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'u1' } }));
    const { me } = await resource(fetchMock);

    await me.updateProfile({ displayName: 'Alice' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/profile');
    expect(fetchMock.calls[0]?.init?.method).toBe('PATCH');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"displayName":"Alice"}');
  });

  it('setAvatar sends a `file` FormData field with no explicit Content-Type', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { avatarUrl: 'x' } }));
    const { me } = await resource(fetchMock);

    await me.setAvatar(new Blob(['x'], { type: 'image/png' }));

    const init = fetchMock.calls[0]!.init!;
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/avatar');
    expect(init.method).toBe('PUT');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).has('file')).toBe(true);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('changeUsername surfaces both outcome branches', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { status: 'applied', identifier: 'bob/example.com' } }),
      jsonResponse({ body: { status: 'pending', requestId: 'req1' } }),
    );
    const { me } = await resource(fetchMock);

    await expect(me.changeUsername({ name: 'bob' })).resolves.toEqual({
      status: 'applied',
      identifier: 'bob/example.com',
    });
    await expect(me.changeUsername({ name: 'bob' })).resolves.toEqual({
      status: 'pending',
      requestId: 'req1',
    });
  });

  it('deleteAccount clears the session store', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const { me, session } = await resource(fetchMock);

    await me.deleteAccount({ password: 'x' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
    expect(session.accessToken).toBeUndefined();
  });

  it('changePassword() hits POST /me/password with the body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const { me } = await resource(fetchMock);

    await expect(
      me.changePassword({ currentPassword: 'old', newPassword: 'new-password-1' }),
    ).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/password');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.calls[0]?.init?.body))).toEqual({
      currentPassword: 'old',
      newPassword: 'new-password-1',
    });
  });

  it('usernameState() hits GET /me/username', async () => {
    const state = { pendingRequest: null };
    const fetchMock = createFetchMock(jsonResponse({ body: state }));
    const { me } = await resource(fetchMock);

    await expect(me.usernameState()).resolves.toEqual(state);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/username');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
  });

  it('cancelUsernameRequest() hits DELETE /me/username/request', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const { me } = await resource(fetchMock);

    await expect(me.cancelUsernameRequest()).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/username/request');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });
});
