import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createUsersResource } from './users.js';

describe('users resource', () => {
  it('getProfile() hits GET /users/:identifier, URL-encoded', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { identifier: 'bob/example.com' } }));
    const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
    const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
    await session.establish({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      sessionId: 's1',
      identifier: 'alice/example.com',
    });
    const users = createUsersResource(session);

    await users.getProfile('bob/example.com');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/users/bob%2Fexample.com');
  });

  async function usersWith(fetchMock: typeof fetch) {
    const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
    const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
    await session.establish({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      sessionId: 's1',
      identifier: 'alice/example.com',
    });
    return createUsersResource(session);
  }

  it('avatar() fetches a Blob with image Accept and the bearer token', async () => {
    const fetchMock = createFetchMock(
      new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/webp' } }),
    );
    const users = await usersWith(fetchMock);

    const blob = await users.avatar('bob/example.com');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/users/bob%2Fexample.com/avatar');
    const headers = new Headers(fetchMock.calls[0]?.init?.headers);
    expect(headers.get('Accept')).toBe('image/*');
    expect(headers.get('Authorization')).toBe('Bearer a');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(2);
  });

  it('avatar() appends ?v= when a version is given and forwards the signal', async () => {
    const fetchMock = createFetchMock(new Response(new Uint8Array([1])));
    const users = await usersWith(fetchMock);
    const controller = new AbortController();

    await users.avatar('bob/example.com', { version: 'abc123', signal: controller.signal });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/users/bob%2Fexample.com/avatar?v=abc123',
    );
    expect(fetchMock.calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('avatar() rejects with a typed error on a problem response', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 404, body: { code: 'http_404', status: 404 } }),
    );
    const users = await usersWith(fetchMock);

    await expect(users.avatar('bob/example.com')).rejects.toMatchObject({ status: 404 });
  });
});
