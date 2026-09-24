import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createRoomsResource } from './rooms.js';

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
  return createRoomsResource(session);
}

type Call = { url: string; init: RequestInit | undefined };

const method = (call: Call | undefined) => call?.init?.method;
const body = (call: Call | undefined) =>
  call?.init?.body ? JSON.parse(String(call.init.body)) : undefined;

describe('rooms resource', () => {
  it('list() hits GET /rooms', async () => {
    const payload = { items: [{ id: 'r1', role: 'member', access: 'member' }] };
    const fetchMock = createFetchMock(jsonResponse({ body: payload }));
    const rooms = await resource(fetchMock);

    const result = await rooms.list();

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms');
    expect(result).toEqual(payload);
  });

  it.each([
    ['get', 'https://api.example.com/rooms/room%2F1'],
    ['preview', 'https://api.example.com/rooms/room%2F1/preview'],
    ['children', 'https://api.example.com/rooms/room%2F1/children'],
    ['myPermissions', 'https://api.example.com/rooms/room%2F1/my-permissions'],
  ] as const)('%s() hits GET on the URL-encoded room path', async (name, url) => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    const rooms = await resource(fetchMock);

    await rooms[name]('room/1');

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe(url);
  });

  it('createSpace() posts the body to /spaces', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 's1' } }));
    const rooms = await resource(fetchMock);

    const result = await rooms.createSpace({ name: 'Engineering', visibility: 'public' });

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/spaces');
    expect(body(fetchMock.calls[0])).toEqual({ name: 'Engineering', visibility: 'public' });
    expect(result).toEqual({ id: 's1' });
  });

  it('createChannel() posts the body to /rooms', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'c1' } }));
    const rooms = await resource(fetchMock);

    await rooms.createChannel({ parentId: 's1', name: 'general' });

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms');
    expect(body(fetchMock.calls[0])).toEqual({ parentId: 's1', name: 'general' });
  });

  it('join() posts to /rooms/:id/join and returns the membership', async () => {
    const membership = { roomId: 'r1', userId: 'u1', role: 'member' };
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: membership }));
    const rooms = await resource(fetchMock);

    const result = await rooms.join('r1');

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/join');
    expect(result).toEqual(membership);
  });

  it('leave() posts to /rooms/:id/leave and resolves on 204', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const rooms = await resource(fetchMock);

    await expect(rooms.leave('r1')).resolves.toBeUndefined();

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/leave');
  });

  it('requestToJoin() posts to /rooms/:id/join-request', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'jr1' } }));
    const rooms = await resource(fetchMock);

    await rooms.requestToJoin('r1');

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/join-request');
  });

  it('listJoinRequests() hits GET /rooms/:id/join-requests with cursor and limit', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const rooms = await resource(fetchMock);

    const result = await rooms.listJoinRequests('r1', { cursor: 'abc', limit: 10 });

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/r1/join-requests?cursor=abc&limit=10',
    );
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('listJoinRequests() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const rooms = await resource(fetchMock);

    await rooms.listJoinRequests('r1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/join-requests');
  });

  it('approveJoinRequest() posts to the encoded request path', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { roomId: 'r1' } }));
    const rooms = await resource(fetchMock);

    await rooms.approveJoinRequest('r1', 'jr/1');

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/r1/join-requests/jr%2F1/approve',
    );
  });

  it('rejectJoinRequest() posts to the encoded request path and resolves on 204', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const rooms = await resource(fetchMock);

    await expect(rooms.rejectJoinRequest('r1', 'jr1')).resolves.toBeUndefined();

    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/r1/join-requests/jr1/reject',
    );
  });

  it('members() hits GET /rooms/:id/members with cursor and limit', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const rooms = await resource(fetchMock);

    const result = await rooms.members('room1', { cursor: 'abc', limit: 25 });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/room1/members?cursor=abc&limit=25',
    );
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('members() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const rooms = await resource(fetchMock);

    await rooms.members('room1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/members');
  });

  it.each([
    [403, 'room.permission_denied', (r: Awaited<ReturnType<typeof resource>>) => r.get('r1')],
    [404, 'room.not_found', (r: Awaited<ReturnType<typeof resource>>) => r.preview('r1')],
    [409, 'room.already_member', (r: Awaited<ReturnType<typeof resource>>) => r.join('r1')],
    [
      422,
      'room.max_depth_exceeded',
      (r: Awaited<ReturnType<typeof resource>>) => r.createSpace({ name: 'x', parentId: 'p' }),
    ],
    [
      409,
      'room.join_request_already_resolved',
      (r: Awaited<ReturnType<typeof resource>>) => r.rejectJoinRequest('r1', 'jr1'),
    ],
  ] as const)('propagates a %i %s problem as an EkozError', async (status, code, call) => {
    const fetchMock = createFetchMock(jsonResponse({ status, body: { code, status } }));
    const rooms = await resource(fetchMock);

    await expect(call(rooms)).rejects.toMatchObject({ status, code });
  });
});
