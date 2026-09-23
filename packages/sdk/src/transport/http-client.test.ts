import { describe, expect, it } from 'vitest';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { NetworkError, NotFoundError } from './errors.js';
import { HttpClient } from './http-client.js';

function client(fetchImpl: typeof fetch, extra: Partial<Record<string, unknown>> = {}) {
  return new HttpClient({
    baseUrl: 'https://api.example.com/v0/',
    fetch: fetchImpl,
    ...(extra as object),
  });
}

describe('HttpClient', () => {
  it('sets the default headers and generates an X-Request-Id', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { ok: true } }));
    await client(fetchMock).request('GET', '/me');

    const headers = new Headers(fetchMock.calls[0]?.init?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Ekoz-Protocol')).toBe('0');
    expect(headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours a caller-supplied requestId', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    await client(fetchMock).request('GET', '/me', { requestId: 'fixed-id' });
    const headers = new Headers(fetchMock.calls[0]?.init?.headers);
    expect(headers.get('X-Request-Id')).toBe('fixed-id');
  });

  it('trims the base URL and appends the query string', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: [] }));
    await client(fetchMock).request('GET', '/sessions', {
      query: { all: true, skip: undefined, cursor: 'abc' },
    });
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/v0/sessions?all=true&cursor=abc');
  });

  it('serialises a JSON body and sets Content-Type', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    await client(fetchMock).request('POST', '/auth/login', {
      body: { identifier: 'a', password: 'b' },
    });
    const init = fetchMock.calls[0]!.init!;
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe('{"identifier":"a","password":"b"}');
  });

  it('passes FormData through without forcing Content-Type', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'avatar.png');
    await client(fetchMock).request('PUT', '/me/avatar', { formData: form });
    const init = fetchMock.calls[0]!.init!;
    expect(init.body).toBeInstanceOf(FormData);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('injects the bearer token when authenticated', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    await client(fetchMock, { getAuthToken: () => 'tok' }).request('GET', '/me');
    expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('returns undefined for 204 and for an empty body', async () => {
    const c1 = client(createFetchMock(jsonResponse({ status: 204 })));
    await expect(c1.request('DELETE', '/sessions/1')).resolves.toBeUndefined();

    const c2 = client(createFetchMock(jsonResponse({ status: 200, raw: '' })));
    await expect(c2.request('GET', '/nothing')).resolves.toBeUndefined();
  });

  it('decodes a non-2xx response into a typed error', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 404, body: { code: 'http_404', status: 404 } }),
    );
    await expect(client(fetchMock).request('GET', '/users/x')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('wraps a fetch throw as NetworkError and surfaces the request id', async () => {
    const fetchMock = createFetchMock(new TypeError('Failed to fetch'));
    let caught: unknown;
    try {
      await client(fetchMock).request('GET', '/me', { requestId: 'net-id' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as NetworkError).requestId).toBe('net-id');
  });

  it('re-throws an AbortError untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchMock = createFetchMock(abort);
    await expect(client(fetchMock).request('GET', '/me')).rejects.toBe(abort);
  });

  it('does not retry on the network', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 500, body: { code: 'internal_error', status: 500 } }),
    );
    await client(fetchMock)
      .request('GET', '/me')
      .catch(() => undefined);
    expect(fetchMock.callCount).toBe(1);
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: {} }));
    const controller = new AbortController();
    await client(fetchMock).request('GET', '/me', { signal: controller.signal });
    expect(fetchMock.calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('exposes the normalised base URL', () => {
    const c = client(createFetchMock(jsonResponse({ body: {} })));
    expect(c.baseUrl).toBe('https://api.example.com/v0');
  });

  describe('blob mode', () => {
    it('sends Accept: image/* and returns the body as a Blob', async () => {
      const fetchMock = createFetchMock(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      );
      const result = await client(fetchMock, { getAuthToken: () => 'tok' }).request<Blob>(
        'GET',
        '/users/bob/avatar',
        { responseType: 'blob' },
      );

      const headers = new Headers(fetchMock.calls[0]?.init?.headers);
      expect(headers.get('Accept')).toBe('image/*');
      expect(headers.get('Authorization')).toBe('Bearer tok');
      expect(headers.get('X-Ekoz-Protocol')).toBe('0');
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/png');
      expect(result.size).toBe(3);
    });

    it('still decodes a problem response into a typed error', async () => {
      const fetchMock = createFetchMock(
        jsonResponse({ status: 404, body: { code: 'http_404', status: 404 } }),
      );
      await expect(
        client(fetchMock).request('GET', '/users/x/avatar', { responseType: 'blob' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('keeps Accept: application/json when responseType is json', async () => {
      const fetchMock = createFetchMock(jsonResponse({ body: {} }));
      await client(fetchMock).request('GET', '/me', { responseType: 'json' });
      expect(new Headers(fetchMock.calls[0]?.init?.headers).get('Accept')).toBe('application/json');
    });
  });
});
