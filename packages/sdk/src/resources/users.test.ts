import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createUsersResource } from './users.js';

describe('users resource', () => {
  it('getProfile() hits GET /users/:identifier, URL-encoded', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { identifier: 'bob/example.com' } }));
    const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
    const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
    await session.establish({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      sessionId: 's1',
      identifier: 'alice/example.com',
    });
    const users = createUsersResource(session);

    await users.getProfile('bob/example.com');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/users/bob%2Fexample.com');
  });
});
