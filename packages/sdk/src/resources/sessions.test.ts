import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createSessionsResource } from './sessions.js';

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
  return createSessionsResource(session);
}

describe('sessions resource', () => {
  it('list() hits GET /sessions', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [] }));
    const sessions = await resource(fetchMock);

    await sessions.list();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/sessions');
  });

  it('rename() PATCHes /sessions/:id with the body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 's2' } }));
    const sessions = await resource(fetchMock);

    await sessions.rename('s2', { deviceName: 'Laptop' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/sessions/s2');
    expect(fetchMock.calls[0]?.init?.method).toBe('PATCH');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"deviceName":"Laptop"}');
  });

  it('revoke() DELETEs /sessions/:id', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const sessions = await resource(fetchMock);

    await sessions.revoke('s2');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/sessions/s2');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });

  it('revokeAllOthers() DELETEs /sessions?all=true', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { revoked: 2 } }));
    const sessions = await resource(fetchMock);

    const result = await sessions.revokeAllOthers();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/sessions?all=true');
    expect(result).toEqual({ revoked: 2 });
  });
});
