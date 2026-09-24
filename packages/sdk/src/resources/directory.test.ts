import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createDirectoryResource } from './directory.js';

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
  return createDirectoryResource(session);
}

describe('directory resource', () => {
  it('list() hits GET /directory with query and cursor', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: 'n' } }));
    const directory = await resource(fetchMock);

    const result = await directory.list({ query: 'dev ops', cursor: 'abc' });

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/directory?query=dev+ops&cursor=abc',
    );
    expect(result).toEqual({ items: [], nextCursor: 'n' });
  });

  it('list() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const directory = await resource(fetchMock);

    await directory.list();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/directory');
  });

  it('propagates a validation problem', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 422, body: { code: 'validation_failed', status: 422 } }),
    );
    const directory = await resource(fetchMock);

    await expect(directory.list({ query: 'x' })).rejects.toMatchObject({ status: 422 });
  });
});
