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
  it('policy() hits GET /messages/policy', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { bodyMaxLength: 16000 } }));
    const messages = await resource(fetchMock);

    await expect(messages.policy()).resolves.toEqual({ bodyMaxLength: 16000 });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/messages/policy');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
  });

  it('list() hits GET /rooms/:id/messages with before and limit', async () => {
    const page = { items: [], lastSeq: '0', hasMore: false, hasMoreNewer: false };
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

    await messages.send('room1', {
      body: 'hello',
      mentions: [{ type: 'user', userId: 'u1' }, { type: 'all' }],
    });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.init?.body).toBe(
      '{"body":"hello","mentions":[{"type":"user","userId":"u1"},{"type":"all"}]}',
    );
  });

  it('send() carries role and group targets', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.send('room1', {
      body: 'hello',
      mentions: [
        { type: 'role', role: 'moderator' },
        { type: 'group', groupId: 'g1' },
      ],
    });

    expect(fetchMock.calls[0]?.init?.body).toBe(
      '{"body":"hello","mentions":[{"type":"role","role":"moderator"},{"type":"group","groupId":"g1"}]}',
    );
  });

  it('send() carries attachments and a link preview url, with no body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 201, body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.send('room1', {
      attachments: ['u1', 'u2'],
      linkPreviewUrl: 'https://example.com/article',
    });

    expect(fetchMock.calls[0]?.init?.body).toBe(
      '{"attachments":["u1","u2"],"linkPreviewUrl":"https://example.com/article"}',
    );
  });

  it('edit() carries attachments add/remove and a null link preview', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.edit('room1', 'm1', {
      attachments: { add: ['u3'], remove: ['a1'] },
      linkPreviewUrl: null,
    });

    expect(fetchMock.calls[0]?.init?.body).toBe(
      '{"attachments":{"add":["u3"],"remove":["a1"]},"linkPreviewUrl":null}',
    );
  });

  it('removeAttachment() DELETEs /rooms/:id/messages/:messageId/attachments/:attachmentId', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const messages = await resource(fetchMock);

    await expect(messages.removeAttachment('room1', 'm1', 'a1')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/room1/messages/m1/attachments/a1',
    );
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });

  it('list() forwards after and around', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }), jsonResponse({ body: {} }));
    const messages = await resource(fetchMock);

    await messages.list('room1', { after: '40', limit: 20 });
    await messages.list('room1', { around: '41' });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/room1/messages?after=40&limit=20',
    );
    expect(fetchMock.calls[1]?.url).toBe('https://api.example.com/rooms/room1/messages?around=41');
  });

  it('edit() PATCHes the body and the full mention list', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.edit('room1', 'm1', { body: 'edited', mentions: [{ type: 'all' }] });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages/m1');
    expect(fetchMock.calls[0]?.init?.method).toBe('PATCH');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"body":"edited","mentions":[{"type":"all"}]}');
  });

  it('edit() leaves mentions out when absent', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'm1' } }));
    const messages = await resource(fetchMock);

    await messages.edit('room1', 'm1', { body: 'edited' });

    expect(fetchMock.calls[0]?.init?.body).toBe('{"body":"edited"}');
  });

  it('policy() carries the edit window', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { bodyMaxLength: 16000, editWindow: 900 } }),
    );
    const messages = await resource(fetchMock);

    await expect(messages.policy()).resolves.toEqual({ bodyMaxLength: 16000, editWindow: 900 });
  });

  it('delete() DELETEs the message and resolves on 204', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const messages = await resource(fetchMock);

    await expect(messages.delete('room1', 'm1')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/messages/m1');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });

  it('pin() PUTs the pin and returns it with its message', async () => {
    const pin = { roomId: 'room1', messageId: 'm1', message: { id: 'm1', reactions: [] } };
    const fetchMock = createFetchMock(jsonResponse({ body: pin }));
    const messages = await resource(fetchMock);

    await expect(messages.pin('room1', 'm1')).resolves.toEqual(pin);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/pins/m1');
    expect(fetchMock.calls[0]?.init?.method).toBe('PUT');
  });

  it('unpin() DELETEs the pin', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const messages = await resource(fetchMock);

    await expect(messages.unpin('room1', 'm1')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/pins/m1');
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });

  it('pins() GETs the pins of a room', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [{ messageId: 'm1' }] }));
    const messages = await resource(fetchMock);

    await expect(messages.pins('room1')).resolves.toEqual([{ messageId: 'm1' }]);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/pins');
    expect(fetchMock.calls[0]?.init?.method).toBe('GET');
  });

  it('react() PUTs the reaction with the emoji encoded, outside the room path', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const messages = await resource(fetchMock);

    await expect(messages.react('m1', '👍')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/messages/m1/reactions/%F0%9F%91%8D',
    );
    expect(fetchMock.calls[0]?.init?.method).toBe('PUT');
  });

  it('unreact() DELETEs the reaction with the emoji encoded', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const messages = await resource(fetchMock);

    await expect(messages.unreact('m1', '🎉')).resolves.toBeUndefined();

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/messages/m1/reactions/%F0%9F%8E%89',
    );
    expect(fetchMock.calls[0]?.init?.method).toBe('DELETE');
  });
});
