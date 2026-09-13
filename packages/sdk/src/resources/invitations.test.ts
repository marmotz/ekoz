import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createInvitationsResource } from './invitations.js';

async function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  await session.establish({
    accessToken: 'owner-token',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'owner/example.com',
  });
  return { invitations: createInvitationsResource(session), http };
}

describe('invitations resource', () => {
  it('create() POSTs /invitations with the bearer token', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { id: 'i1', token: 't', url: 'https://x' } }),
    );
    const { invitations } = await resource(fetchMock);

    await invitations.create({ email: 'a@example.com' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/invitations');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer owner-token',
    );
  });

  it('list() GETs /invitations', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [] }));
    const { invitations } = await resource(fetchMock);

    await invitations.list();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/invitations');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
  });

  it('revoke() DELETEs /invitations/:id', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const { invitations } = await resource(fetchMock);

    await invitations.revoke('i1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/invitations/i1');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });
});
