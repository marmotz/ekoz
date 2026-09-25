import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createMentionsResource } from './mentions.js';

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
  return createMentionsResource(session);
}

describe('mentions resource', () => {
  it('list() hits GET /me/mentions with cursor and limit', async () => {
    const page = { items: [], nextCursor: null };
    const fetchMock = createFetchMock(jsonResponse({ body: page }));
    const mentions = await resource(fetchMock);

    const result = await mentions.list({ cursor: 'abc', limit: 20 });

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/mentions?cursor=abc&limit=20');
    expect(result).toEqual(page);
  });

  it('list() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const mentions = await resource(fetchMock);

    await mentions.list();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/mentions');
  });

  it('unread() hits GET /me/mentions/unread', async () => {
    const counters = { items: [{ roomId: 'r1', direct: 2, collective: 1 }] };
    const fetchMock = createFetchMock(jsonResponse({ body: counters }));
    const mentions = await resource(fetchMock);

    const result = await mentions.unread();

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/mentions/unread');
    expect(result).toEqual(counters);
  });
});
