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

describe('rooms resource', () => {
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
});
