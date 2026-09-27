import { describe, expect, it, vi } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import type { FileRef } from './files.js';
import { createFilesResource, SignedUrlCache } from './files.js';

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
  return createFilesResource(session);
}

const ATTACHMENT_REF: FileRef = { kind: 'attachment', id: 'a1', variant: 'original' };

describe('files resource', () => {
  it('urls() POSTs the refs to /files/urls', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [] } }));
    const files = await resource(fetchMock);

    await files.urls([ATTACHMENT_REF]);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/files/urls');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.init?.body).toBe(
      '{"items":[{"kind":"attachment","id":"a1","variant":"original"}]}',
    );
  });

  it('roomFiles() GETs /rooms/:id/files with kind, before and limit', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const files = await resource(fetchMock);

    await files.roomFiles('room1', { kind: 'media', before: 'a1', limit: 20 });

    expect(fetchMock.calls[0]?.url).toBe(
      'https://api.example.com/rooms/room1/files?kind=media&before=a1&limit=20',
    );
  });

  it('roomFiles() omits the query string without params', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { items: [], nextCursor: null } }));
    const files = await resource(fetchMock);

    await files.roomFiles('room1');

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/rooms/room1/files');
  });
});

describe('SignedUrlCache', () => {
  it('batches same-tick get() calls into one urls() request', async () => {
    const urls = vi.fn().mockResolvedValue({
      items: [
        {
          ref: ATTACHMENT_REF,
          url: 'https://cdn.example.com/a1',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
        {
          ref: { kind: 'preview', previewId: 'p1' },
          url: 'https://cdn.example.com/p1',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      ],
    });
    const cache = new SignedUrlCache({ urls, roomFiles: vi.fn() });

    const [a, p] = await Promise.all([
      cache.get(ATTACHMENT_REF),
      cache.get({ kind: 'preview', previewId: 'p1' }),
    ]);

    expect(urls).toHaveBeenCalledTimes(1);
    expect(urls).toHaveBeenCalledWith([ATTACHMENT_REF, { kind: 'preview', previewId: 'p1' }]);
    expect(a).toBe('https://cdn.example.com/a1');
    expect(p).toBe('https://cdn.example.com/p1');
  });

  it('serves a cached url without re-issuing a request', async () => {
    const urls = vi.fn().mockResolvedValue({
      items: [
        {
          ref: ATTACHMENT_REF,
          url: 'https://cdn.example.com/a1',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      ],
    });
    const cache = new SignedUrlCache({ urls, roomFiles: vi.fn() });

    await cache.get(ATTACHMENT_REF);
    await cache.get(ATTACHMENT_REF);

    expect(urls).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the cached url is within its 60s expiry margin', async () => {
    const soonToExpire = new Date(Date.now() + 30_000).toISOString();
    const fresh = new Date(Date.now() + 3_600_000).toISOString();
    const urls = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ ref: ATTACHMENT_REF, url: 'old', expiresAt: soonToExpire }],
      })
      .mockResolvedValueOnce({ items: [{ ref: ATTACHMENT_REF, url: 'new', expiresAt: fresh }] });
    const cache = new SignedUrlCache({ urls, roomFiles: vi.fn() });

    const first = await cache.get(ATTACHMENT_REF);
    const second = await cache.get(ATTACHMENT_REF);

    expect(urls).toHaveBeenCalledTimes(2);
    expect(first).toBe('old');
    expect(second).toBe('new');
  });

  it('resolves to undefined when the server denied the ref', async () => {
    const urls = vi.fn().mockResolvedValue({
      items: [{ ref: ATTACHMENT_REF, error: 'files.not_found' }],
    });
    const cache = new SignedUrlCache({ urls, roomFiles: vi.fn() });

    await expect(cache.get(ATTACHMENT_REF)).resolves.toBeUndefined();
  });

  it('clear() forces the next get() to re-issue a request', async () => {
    const urls = vi.fn().mockResolvedValue({
      items: [{ ref: ATTACHMENT_REF, url: 'a', expiresAt: '2999-01-01T00:00:00.000Z' }],
    });
    const cache = new SignedUrlCache({ urls, roomFiles: vi.fn() });

    await cache.get(ATTACHMENT_REF);
    cache.clear();
    await cache.get(ATTACHMENT_REF);

    expect(urls).toHaveBeenCalledTimes(2);
  });
});
