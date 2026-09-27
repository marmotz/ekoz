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

  it('users.storage() GETs /admin/users/:id/storage', async () => {
    const view = { usedBytes: '100', pendingBytes: '0', quotaBytes: null, overridden: false };
    const fetchMock = createFetchMock(jsonResponse({ body: view }));
    const admin = await resource(fetchMock);

    await expect(admin.users.storage('u2')).resolves.toEqual(view);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users/u2/storage');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
  });

  it('users.setStorageQuota() PUTs the quota, null included', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }), jsonResponse({ status: 204 }));
    const admin = await resource(fetchMock);

    await admin.users.setStorageQuota('u2', '1000000');
    await admin.users.setStorageQuota('u2', null);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users/u2/storage-quota');
    expect(fetchMock.calls[0]?.init?.method).toBe('PUT');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"quotaBytes":"1000000"}');
    expect(fetchMock.calls[1]?.init?.body).toBe('{"quotaBytes":null}');
  });

  it('users.resetStorageQuota() DELETEs /admin/users/:id/storage-quota', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const admin = await resource(fetchMock);

    await expect(admin.users.resetStorageQuota('u2')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/users/u2/storage-quota');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });

  it('settings.list() / set() / reset() hit the expected endpoints', async () => {
    const parameter = {
      key: 'attachments.max_per_message',
      kind: 'runtime',
      value: 10,
      source: 'default',
      locked: false,
      hotReloadable: true,
      secret: false,
      schemaHint: null,
    };
    const fetchMock = createFetchMock(
      jsonResponse({ body: [parameter] }),
      jsonResponse({ body: { ...parameter, value: 5 } }),
      jsonResponse({ status: 204 }),
    );
    const admin = await resource(fetchMock);

    await expect(admin.settings.list()).resolves.toEqual([parameter]);
    await expect(admin.settings.set('attachments.max_per_message', 5)).resolves.toEqual({
      ...parameter,
      value: 5,
    });
    await expect(admin.settings.reset('attachments.max_per_message')).resolves.toBeUndefined();

    expect(fetchMock.calls.map((c) => [c.init?.method, c.url])).toEqual([
      ['GET', 'https://api.example.com/admin/settings'],
      ['PUT', 'https://api.example.com/admin/settings/attachments.max_per_message'],
      ['DELETE', 'https://api.example.com/admin/settings/attachments.max_per_message'],
    ]);
    expect(fetchMock.calls[1]?.init?.body).toBe('{"value":5}');
  });

  it('storage() GETs /admin/storage', async () => {
    const dashboard = {
      usedBytes: '100',
      capacityBytes: null,
      blobCount: 1,
      pendingUploads: 0,
      topConsumers: [],
      driver: 'local',
      mediaTools: { available: true, ffmpegVersion: null },
    };
    const fetchMock = createFetchMock(jsonResponse({ body: dashboard }));
    const admin = await resource(fetchMock);

    await expect(admin.storage()).resolves.toEqual(dashboard);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/storage');
  });

  it('attachments.search() forwards every query param', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const admin = await resource(fetchMock);

    await admin.attachments.search({
      q: 'report',
      uploaderId: 'u1',
      roomId: 'r1',
      type: 'documents',
      before: 'a1',
      limit: 20,
    });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/admin/attachments?q=report&uploaderId=u1&roomId=r1&type=documents&before=a1&limit=20',
    );
  });

  it('attachments.search() with no params omits the query string', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const admin = await resource(fetchMock);

    await admin.attachments.search();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/attachments');
  });

  it('blobs.remove() DELETEs /admin/blobs/:id', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const admin = await resource(fetchMock);

    await expect(admin.blobs.remove('b1')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/admin/blobs/b1');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });
});
