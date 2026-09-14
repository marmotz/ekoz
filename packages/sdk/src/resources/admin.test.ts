import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { LastOwnerError, NotFoundError } from '../transport/errors.js';
import { HttpClient } from '../transport/http-client.js';
import { createAdminResource } from './admin.js';

async function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  await session.establish({
    accessToken: 'owner-token',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'owner/example.com',
  });
  return createAdminResource(session);
}

describe('admin resource', () => {
  it('users.list() sends path/verb and forwards query params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const admin = await resource(fetchMock);

    const result = await admin.users.list({
      q: 'alice',
      status: 'active',
      owner: true,
      cursor: 'c1',
      limit: 20,
    });

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/admin/users?q=alice&status=active&owner=true&cursor=c1&limit=20',
    );
    expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer owner-token',
    );
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('users.list() with no params omits the query string', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const admin = await resource(fetchMock);

    await admin.users.list();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users');
  });

  it('users.get() GETs /admin/users/:id, 404 surfaces as NotFoundError', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'u2' } }));
    const admin = await resource(fetchMock);
    await admin.users.get('u2');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users/u2');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');

    const notFound = createFetchMock(
      jsonResponse({ status: 404, body: { code: 'identity.user_not_found', status: 404 } }),
    );
    const admin2 = await resource(notFound);
    await expect(admin2.users.get('nope')).rejects.toThrow(NotFoundError);
  });

  it('users.triggerPasswordReset() POSTs /admin/users/:id/password-reset', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { accepted: true } }));
    const admin = await resource(fetchMock);

    const result = await admin.users.triggerPasswordReset('u2');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users/u2/password-reset');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(result).toEqual({ accepted: true });
  });

  it('users.create() POSTs /admin/users with the bearer token', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'u2' } }));
    const admin = await resource(fetchMock);

    await admin.users.create({
      name: 'bob',
      email: 'bob@example.com',
      password: 'x',
      displayName: 'Bob',
    });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer owner-token',
    );
  });

  it('users.suspend() / unsuspend() / delete() hit the expected endpoints', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 204 }),
      jsonResponse({ status: 204 }),
      jsonResponse({ status: 204 }),
    );
    const admin = await resource(fetchMock);

    await admin.users.suspend('u2', { reason: 'abuse' });
    await admin.users.unsuspend('u2');
    await admin.users.delete('u2');

    expect(fetchMock.calls.map((c) => [c.init?.method, c.url])).toEqual([
      ['POST', 'https://api.example.com/admin/users/u2/suspend'],
      ['POST', 'https://api.example.com/admin/users/u2/unsuspend'],
      ['DELETE', 'https://api.example.com/admin/users/u2'],
    ]);
  });

  it('owners.remove() surfaces identity.last_owner as LastOwnerError', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 409, body: { code: 'identity.last_owner', status: 409 } }),
    );
    const admin = await resource(fetchMock);

    await expect(admin.owners.remove('u2')).rejects.toThrow(LastOwnerError);
  });

  it('usernameRequests.list() forwards the status query param', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [] }));
    const admin = await resource(fetchMock);

    await admin.usernameRequests.list('pending');

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/admin/username-requests?status=pending',
    );
  });

  it('usernameRequests.approve() / reject() hit the expected endpoints', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { identifier: 'bob/example.com' } }),
      jsonResponse({ status: 204 }),
    );
    const admin = await resource(fetchMock);

    await admin.usernameRequests.approve('req1');
    await admin.usernameRequests.reject('req2');

    expect(fetchMock.calls.map((c) => c.url)).toEqual([
      'https://api.example.com/admin/username-requests/req1/approve',
      'https://api.example.com/admin/username-requests/req2/reject',
    ]);
  });
});
