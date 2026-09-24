import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createRoomInvitationsResource } from './room-invitations.js';

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
  return createRoomInvitationsResource(session);
}

describe('room invitations resource', () => {
  it('listMine() hits GET /me/room-invitations', async () => {
    const payload = { items: [{ id: 'i1', role: 'member' }] };
    const fetchMock = createFetchMock(jsonResponse({ body: payload }));
    const invitations = await resource(fetchMock);

    const result = await invitations.listMine();

    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/me/room-invitations');
    expect(result).toEqual(payload);
  });

  it('accept() posts to /invitations/:id/accept, URL-encoded', async () => {
    const membership = { roomId: 'r1', userId: 'u1', role: 'member' };
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: membership }));
    const invitations = await resource(fetchMock);

    const result = await invitations.accept('i/1');

    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/invitations/i%2F1/accept');
    expect(result).toEqual(membership);
  });

  it('decline() posts to /invitations/:id/decline and resolves on 204', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const invitations = await resource(fetchMock);

    await expect(invitations.decline('i1')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/invitations/i1/decline');
  });

  it('propagates a room.invitation_already_resolved problem', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        status: 409,
        body: { code: 'room.invitation_already_resolved', status: 409 },
      }),
    );
    const invitations = await resource(fetchMock);

    await expect(invitations.accept('i1')).rejects.toMatchObject({
      status: 409,
      code: 'room.invitation_already_resolved',
    });
  });
});
