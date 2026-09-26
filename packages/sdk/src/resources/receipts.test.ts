import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createReceiptsResource } from './receipts.js';

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
  return createReceiptsResource(session);
}

const marker = { roomId: 'r1', userId: 'u1', seq: '42', updatedAt: '2026-01-01T00:00:00.000Z' };

describe('receipts resource', () => {
  it('set() hits PUT /rooms/:id/receipt with the seq body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: marker }));
    const receipts = await resource(fetchMock);

    const result = await receipts.set('r1', '42');

    expect(fetchMock.calls[0]?.init?.method).toBe('PUT');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/receipt');
    expect(JSON.parse(String(fetchMock.calls[0]?.init?.body))).toEqual({ seq: '42' });
    expect(result).toEqual(marker);
  });

  it('list() hits GET /rooms/:id/receipts and decodes the markers', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [marker] }));
    const receipts = await resource(fetchMock);

    const result = await receipts.list('r1');

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/r1/receipts');
    expect(result).toEqual([marker]);
  });
});
