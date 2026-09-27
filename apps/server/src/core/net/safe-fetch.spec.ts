import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SafeFetchBlockedError, SafeFetchError, safeFetch } from './safe-fetch.js';

/**
 * Exercises the HTTP mechanics (redirects, timeout, size cap, content-type
 * allow-list) against a local fixture server, the SSRF guard bypassed only in
 * this file via `allowPrivateAddresses` — the fixture itself is on loopback,
 * which the guard would otherwise refuse (proven by the last `describe`
 * below, where the bypass is deliberately left off).
 */
describe('safeFetch (local fixture, guard bypassed)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://local.test');
      if (url.pathname === '/html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>Hello</title></head></html>');
        return;
      }
      if (url.pathname === '/redirect-once') {
        res.writeHead(302, { Location: '/html' });
        res.end();
        return;
      }
      if (url.pathname === '/redirect-loop') {
        res.writeHead(302, { Location: '/redirect-loop' });
        res.end();
        return;
      }
      if (url.pathname === '/big') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('x'.repeat(2_000_000));
        return;
      }
      if (url.pathname === '/slow') {
        // Never responds within the test's timeout budget.
        return;
      }
      if (url.pathname === '/wrong-type') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('fetches a page and returns its body and content type', async () => {
    const result = await safeFetch(`${baseUrl}/html`, {
      allowedContentTypePrefixes: ['text/html'],
      maxBytes: 1024,
      allowPrivateAddresses: true,
    });
    expect(result.contentType).toBe('text/html');
    expect(result.body.toString('utf8')).toContain('<title>Hello</title>');
    expect(result.finalUrl).toBe(`${baseUrl}/html`);
  });

  it('follows a redirect and reports the final URL', async () => {
    const result = await safeFetch(`${baseUrl}/redirect-once`, {
      allowedContentTypePrefixes: ['text/html'],
      maxBytes: 1024,
      allowPrivateAddresses: true,
    });
    expect(result.finalUrl).toBe(`${baseUrl}/html`);
  });

  it('refuses a redirect loop past the redirect budget', async () => {
    await expect(
      safeFetch(`${baseUrl}/redirect-loop`, {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
        maxRedirects: 2,
        allowPrivateAddresses: true,
      }),
    ).rejects.toThrow(SafeFetchError);
  });

  it('refuses a response over the size cap', async () => {
    await expect(
      safeFetch(`${baseUrl}/big`, {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
        allowPrivateAddresses: true,
      }),
    ).rejects.toThrow(SafeFetchError);
  });

  it('refuses a content type outside the allow-list', async () => {
    await expect(
      safeFetch(`${baseUrl}/wrong-type`, {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
        allowPrivateAddresses: true,
      }),
    ).rejects.toThrow(SafeFetchError);
  });

  it('times out a request that never responds', async () => {
    await expect(
      safeFetch(`${baseUrl}/slow`, {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
        timeoutMs: 100,
        allowPrivateAddresses: true,
      }),
    ).rejects.toThrow();
  }, 2000);

  it('refuses a non-http(s) URL', async () => {
    await expect(
      safeFetch('ftp://127.0.0.1/whatever', {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
        allowPrivateAddresses: true,
      }),
    ).rejects.toThrow(SafeFetchError);
  });
});

describe('safeFetch (guard active, no bypass)', () => {
  it('refuses to connect to a loopback address', async () => {
    await expect(
      safeFetch('http://127.0.0.1:1/whatever', {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: 1024,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
  });
});
