/**
 * Configured `fetch` wrapper shared by every SDK resource.
 *
 * Responsibilities: build the URL from the discovery-resolved REST base, set the
 * default headers (`Accept`, `X-Ekoz-Protocol`, `X-Request-Id`, optional
 * `Authorization`), serialise JSON bodies (pass `FormData` through untouched),
 * and route every non-2xx response through the single `problem+json` decoder.
 *
 * No automatic network retry in this increment.
 */

import { decodeProblem, toNetworkError } from './problem.js';
import { newRequestId, REQUEST_ID_HEADER } from './request-context.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** JSON request body. Ignored when `formData` or `rawBody` is set. */
  body?: unknown;
  /** Multipart body; sent as-is so the platform sets the boundary. */
  formData?: FormData;
  /**
   * Pre-serialised request body (e.g. one chunk of bytes for a tus `PATCH`),
   * sent as-is with no `Content-Type` inferred — the caller sets it via
   * `headers`. Takes precedence over `body`, ignored when `formData` is set.
   */
  rawBody?: NonNullable<RequestInit['body']>;
  /** Query-string parameters; `null` / `undefined` values are skipped. */
  query?: Record<string, QueryValue>;
  /** Abort signal, forwarded to `fetch`. */
  signal?: AbortSignal;
  /** Extra request headers (override the defaults on collision). */
  headers?: Record<string, string>;
  /** Explicit `X-Request-Id`; generated when omitted. */
  requestId?: string;
  /**
   * How the response is decoded. `json` (default) parses JSON and sends
   * `Accept: application/json`; `blob` sends `Accept: image/*` and returns the
   * raw body as a `Blob`; `raw` returns the `Response` itself, unread — for a
   * caller that needs response headers (tus `Location` / `Upload-Offset` /
   * `Ekoz-Upload`). Non-2xx responses are problem+json in every mode.
   */
  responseType?: 'json' | 'blob' | 'raw';
}

export interface HttpClientOptions {
  /** REST base URL, no trailing slash (from discovery `api`). */
  baseUrl: string;
  /** `fetch` implementation; defaults to the global. */
  fetch?: typeof fetch;
  /** Protocol major advertised on every request. Defaults to `"0"`. */
  protocolVersion?: string;
  /** Supplies the current access token for authenticated calls. */
  getAuthToken?: () => string | undefined;
}

export const PROTOCOL_HEADER = 'X-Ekoz-Protocol';
export const DEFAULT_PROTOCOL_VERSION = '0';

export class HttpClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #protocolVersion: string;
  readonly #getAuthToken: (() => string | undefined) | undefined;

  constructor(options: HttpClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('global fetch is unavailable; pass options.fetch explicitly');
    }
    // Bind to avoid `Illegal invocation` when the global is passed by reference.
    this.#fetch = (input, init) => fetchImpl(input, init);
    this.#protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this.#getAuthToken = options.getAuthToken;
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.#buildUrl(path, options.query);
    const requestId = options.requestId ?? newRequestId();

    const headers = new Headers(options.headers);
    const blobMode = options.responseType === 'blob';
    headers.set('Accept', blobMode ? 'image/*' : 'application/json');
    headers.set(PROTOCOL_HEADER, this.#protocolVersion);
    if (!headers.has(REQUEST_ID_HEADER)) {
      headers.set(REQUEST_ID_HEADER, requestId);
    }
    const token = this.#getAuthToken?.();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const init: RequestInit = { method, headers };
    if (options.signal) init.signal = options.signal;

    if (options.formData !== undefined) {
      init.body = options.formData;
    } else if (options.rawBody !== undefined) {
      init.body = options.rawBody;
    } else if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw toNetworkError(cause, headers.get(REQUEST_ID_HEADER) ?? requestId);
    }

    if (!response.ok) {
      throw await decodeProblem(response, requestId);
    }

    if (options.responseType === 'raw') return response as unknown as T;
    if (blobMode) return (await response.blob()) as T;
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (text.length === 0) return undefined as T;
    return JSON.parse(text) as T;
  }

  #buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${this.#baseUrl}${normalisedPath}`;
    if (query) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) continue;
        search.append(key, String(value));
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }
}
