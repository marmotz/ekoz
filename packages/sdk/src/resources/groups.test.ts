import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createGroupsResource } from './groups.js';

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
  return createGroupsResource(session);
}

const method = (call: { init: RequestInit | undefined } | undefined) => call?.init?.method;

describe('groups resource', () => {
  it('list() hits GET /rooms/:id/groups', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [] } }));
    const groups = await resource(fetchMock);

    await groups.list('r1');

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups');
  });

  it('get() hits GET /rooms/:id/groups/:groupId', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'g1', members: [] } }));
    const groups = await resource(fetchMock);

    await groups.get('r1', 'g1');

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups/g1');
  });

  it('create() POSTs the name and member ids', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'g1' } }));
    const groups = await resource(fetchMock);

    await groups.create('r1', { name: 'devs', memberIds: ['u1', 'u2'] });

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"name":"devs","memberIds":["u1","u2"]}');
  });

  it('rename() PATCHes the new name', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'g1' } }));
    const groups = await resource(fetchMock);

    await groups.rename('r1', 'g1', 'engineers');

    expect(method(fetchMock.calls[0])).toBe('PATCH');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups/g1');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"name":"engineers"}');
  });

  it('remove() DELETEs the group and resolves on 204', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const groups = await resource(fetchMock);

    await expect(groups.remove('r1', 'g1')).resolves.toBeUndefined();

    expect(method(fetchMock.calls[0])).toBe('DELETE');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups/g1');
  });

  it('addMember() PUTs and removeMember() DELETEs /members/:userId', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }), jsonResponse({ status: 204 }));
    const groups = await resource(fetchMock);

    await expect(groups.addMember('r1', 'g1', 'u1')).resolves.toBeUndefined();
    await expect(groups.removeMember('r1', 'g1', 'u1')).resolves.toBeUndefined();

    expect(method(fetchMock.calls[0])).toBe('PUT');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/groups/g1/members/u1');
    expect(method(fetchMock.calls[1])).toBe('DELETE');
    expect(fetchMock.calls[1]?.url).toBe('https://api.example.com/rooms/r1/groups/g1/members/u1');
  });

  it('encodes ids in the path', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const groups = await resource(fetchMock);

    await groups.addMember('r/1', 'g 1', 'u#1');

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/r%2F1/groups/g%201/members/u%231',
    );
  });
});
