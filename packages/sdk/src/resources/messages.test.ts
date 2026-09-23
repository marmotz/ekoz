import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createMessagesResource } from './messages.js';

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
  return createMessagesResource(session);
}

describe('messages resource', () => {
  it('list() hits GET /rooms/:id/messages with before and limit', async () => {
    const page = { items: [], lastSeq: '0', hasMore: false };
    const fetchMock = createFetchMock(jsonResponse({ body: page }));
    const messages = await resource(fetchMock);

    const result = await messages.list('room1', { before: '40', limit: 20 });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/room1/messages?before=40&limit=20',
    );
    expect(result).toEqual(page);
  });

  it('list() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    const messages = await resource(fetchMock);

    await messages.list('room1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages');
  });

  it('get() hits GET /rooms/:id/messages/:messageId', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.get('room1', 'm1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages/m1');
  });

  it('send() POSTs the body to /rooms/:id/messages', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.send('room1', { body: 'hello', mentions: ['u1'] });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"body":"hello","mentions":["u1"]}');
  });
});
