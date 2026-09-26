import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createConversationsResource } from './conversations.js';

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
  return createConversationsResource(session);
}

type Call = { url: string; init: RequestInit | undefined };

const method = (call: Call | undefined) => call?.init?.method;
const body = (call: Call | undefined) =>
  call?.init?.body ? JSON.parse(String(call.init.body)) : undefined;

describe('conversations resource', () => {
  it('list() hits GET /me/conversations', async () => {
    const payload = { items: [{ id: 'c1', type: 'dm' }] };
    const fetchMock = createFetchMock(jsonResponse({ body: payload }));
    const conversations = await resource(fetchMock);

    const result = await conversations.list();

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/conversations');
    expect(result).toEqual(payload);
  });

  it('createDm() posts the user id to /dms', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'c1' } }));
    const conversations = await resource(fetchMock);

    const room = await conversations.createDm('u1');

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/dms');
    expect(body(fetchMock.calls[0])).toEqual({ userId: 'u1' });
    expect(room).toEqual({ id: 'c1' });
  });

  it('createGroup() posts the members and the optional name to /group-dms', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'g1' } }));
    const conversations = await resource(fetchMock);

    await conversations.createGroup({ userIds: ['u1', 'u2'], name: 'Trip' });

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/group-dms');
    expect(body(fetchMock.calls[0])).toEqual({ userIds: ['u1', 'u2'], name: 'Trip' });
  });

  it('rename() patches the URL-encoded group with the name', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'g/1' } }));
    const conversations = await resource(fetchMock);

    await conversations.rename('g/1', 'Trip');

    expect(method(fetchMock.calls[0])).toBe('PATCH');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/group-dms/g%2F1');
    expect(body(fetchMock.calls[0])).toEqual({ name: 'Trip' });
  });

  it('rename() sends null to clear the name', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'g1' } }));
    const conversations = await resource(fetchMock);

    await conversations.rename('g1', null);

    expect(body(fetchMock.calls[0])).toEqual({ name: null });
  });

  it('addMembers() posts the users and the history choice', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [{ userId: 'u3' }] }));
    const conversations = await resource(fetchMock);

    const added = await conversations.addMembers('g/1', { userIds: ['u3'], history: 'none' });

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/group-dms/g%2F1/members');
    expect(body(fetchMock.calls[0])).toEqual({ userIds: ['u3'], history: 'none' });
    expect(added).toEqual([{ userId: 'u3' }]);
  });

  it.each([
    ['removeMember', 'DELETE', 'https://api.example.com/group-dms/g%2F1/members/u%2F2'],
    ['grantAdmin', 'PUT', 'https://api.example.com/group-dms/g%2F1/admins/u%2F2'],
    ['revokeAdmin', 'DELETE', 'https://api.example.com/group-dms/g%2F1/admins/u%2F2'],
  ] as const)('%s() sends %s on the URL-encoded path', async (name, verb, url) => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const conversations = await resource(fetchMock);

    await conversations[name]('g/1', 'u/2');

    expect(method(fetchMock.calls[0])).toBe(verb);
    expect(fetchMock.calls[0]?.url).toBe(url);
  });

  it('searchContacts() sends the encoded query to /me/contacts', async () => {
    const payload = { items: [{ id: 'u1' }] };
    const fetchMock = createFetchMock(jsonResponse({ body: payload }));
    const conversations = await resource(fetchMock);

    const result = await conversations.searchContacts('al ice');

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/contacts?query=al+ice');
    expect(result).toEqual(payload);
  });
});
