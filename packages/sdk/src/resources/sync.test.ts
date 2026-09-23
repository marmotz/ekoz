import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createSyncResource } from './sync.js';

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
  return createSyncResource(session);
}

describe('sync resource', () => {
  it('get() hits GET /sync with room, since and limit', async () => {
    const response = {
      events: [
        {
          roomId: 'room1',
          seq: '3',
          type: 'message_created',
          senderId: 'u1',
          content: { messageId: 'm1', body: 'hi', replyToId: null, mentions: [] },
          originServer: 'example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      lastSeq: '3',
    };
    const fetchMock = createFetchMock(jsonResponse({ body: response }));
    const sync = await resource(fetchMock);

    const result = await sync.get({ room: 'room1', since: '2', limit: 50 });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/sync?room=room1&since=2&limit=50',
    );
    expect(result).toEqual(response);
  });

  it('get() omits since and limit when absent', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { events: [], lastSeq: '0' } }));
    const sync = await resource(fetchMock);

    await sync.get({ room: 'room1' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/sync?room=room1');
  });
});
