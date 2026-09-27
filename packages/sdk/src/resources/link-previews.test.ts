import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createLinkPreviewsResource } from './link-previews.js';

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
  return createLinkPreviewsResource(session);
}

describe('link previews resource', () => {
  it('fetch() POSTs the url to /link-previews and returns the preview', async () => {
    const preview = {
      id: 'lp1',
      url: 'https://example.com/article',
      title: 'An article',
      description: null,
      siteName: null,
      hasImage: false,
    };
    const fetchMock = createFetchMock(jsonResponse({ body: preview }));
    const linkPreviews = await resource(fetchMock);

    await expect(linkPreviews.fetch('https://example.com/article')).resolves.toEqual(preview);

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/link-previews');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.init?.body).toBe('{"url":"https://example.com/article"}');
  });

  it('fetch() resolves to null on a 204 (no usable metadata)', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const linkPreviews = await resource(fetchMock);

    await expect(linkPreviews.fetch('https://example.com/blank')).resolves.toBeNull();
  });
});
