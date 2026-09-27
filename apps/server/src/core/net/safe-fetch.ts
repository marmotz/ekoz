import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isPublicAddress } from './address-classifier.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_USER_AGENT = 'Ekoz-LinkPreview/1.0 (+https://ekoz.example)';

export class SafeFetchBlockedError extends Error {
  constructor(message = 'The target address is not publicly reachable.') {
    super(message);
    this.name = 'SafeFetchBlockedError';
  }
}

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions {
  /** Accepted `Content-Type` prefixes (e.g. `text/html`, `image/`); the response is refused otherwise. */
  allowedContentTypePrefixes: readonly string[];
  /** Response body cap in bytes. */
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** Test-only escape hatch: when true, `isPublicAddress` is not consulted. */
  allowPrivateAddresses?: boolean;
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  body: Buffer;
}

/**
 * `http(s)`-only outbound fetch with SSRF protections (technical.md §S10):
 * DNS is resolved and validated before connecting, the TCP connection is
 * pinned to the checked address (no re-resolution on connect, closing the
 * DNS-rebinding gap), each redirect is re-validated the same way (up to
 * `maxRedirects`), the response is capped at `maxBytes`, and no cookies are
 * ever sent or stored — the caller supplies its own fixed `User-Agent`.
 */
export async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  let currentUrl = url;
  for (let redirects = 0; ; redirects++) {
    const parsed = parseHttpUrl(currentUrl);
    const address = await resolvePublicAddress(
      parsed.hostname,
      options.allowPrivateAddresses ?? false,
    );

    const response = await performRequest(parsed, address, { timeoutMs, userAgent });

    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      response.body.destroy();
      if (redirects >= maxRedirects) {
        throw new SafeFetchError('Too many redirects.');
      }
      currentUrl = new URL(response.location, currentUrl).toString();
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.body.destroy();
      throw new SafeFetchError(`Unexpected status ${response.statusCode}.`);
    }

    const contentType = (response.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!options.allowedContentTypePrefixes.some((prefix) => contentType.startsWith(prefix))) {
      response.body.destroy();
      throw new SafeFetchError(`Unsupported content type "${contentType}".`);
    }

    const body = await readCapped(response.body, options.maxBytes);

    return { finalUrl: currentUrl, contentType, body };
  }
}

function parseHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeFetchError('Invalid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SafeFetchError('Only http(s) URLs are supported.');
  }

  return parsed;
}

async function resolvePublicAddress(hostname: string, allowPrivate: boolean): Promise<string> {
  let resolved: LookupAddress;
  try {
    resolved = await dnsLookup(hostname);
  } catch {
    throw new SafeFetchError('DNS resolution failed.');
  }
  if (!allowPrivate && !isPublicAddress(resolved.address)) {
    throw new SafeFetchBlockedError();
  }

  return resolved.address;
}

interface RawResponse {
  statusCode: number;
  contentType: string | null;
  location: string | null;
  body: NodeJS.ReadableStream & { destroy: () => void };
}

function performRequest(
  parsed: URL,
  pinnedAddress: string,
  options: { timeoutMs: number; userAgent: string },
): Promise<RawResponse> {
  const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        // Pinned to the already-checked address; `servername`/`Host` keep the
        // original hostname so TLS SNI and virtual hosting still work.
        host: pinnedAddress,
        servername: parsed.protocol === 'https:' ? parsed.hostname : undefined,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        timeout: options.timeoutMs,
        headers: {
          Host: parsed.host,
          'User-Agent': options.userAgent,
          Accept: '*/*',
        },
      },
      (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          contentType: (res.headers['content-type'] as string | undefined) ?? null,
          location: (res.headers.location as string | undefined) ?? null,
          body: res,
        });
      },
    );
    req.on('timeout', () => req.destroy(new SafeFetchError('Request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

async function readCapped(
  stream: NodeJS.ReadableStream & { destroy: () => void },
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(new SafeFetchError('Response body exceeds the size cap.'));

        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
