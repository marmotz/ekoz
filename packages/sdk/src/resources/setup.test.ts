import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createSetupResource } from './setup.js';

function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  return { setup: createSetupResource(http, session), session };
}

describe('setup resource', () => {
  it('creates the owner and establishes the session', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: {
          user: { id: 'u1', identifier: 'owner/example.com' },
          accessToken: 'a',
          refreshToken: 'r',
          expiresIn: 900,
          session: { id: 's1' },
        },
      }),
    );
    const { setup, session } = resource(fetchMock);

    const result = await setup.createOwner({
      email: 'owner@example.com',
      password: 'x',
      name: 'owner',
      displayName: 'Owner',
    });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/setup/owner');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(result.user.identifier).toBe('owner/example.com');
    expect(session.accessToken).toBe('a');
    expect(session.getState()).toEqual({ identifier: 'owner/example.com', sessionId: 's1' });
  });
});
