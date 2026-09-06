import { vi } from 'vitest';

export interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send a raw string body instead of JSON-serialising `body`. */
  raw?: string;
}

/** Build a `Response` mimicking the server (problem+json on errors). */
export function jsonResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers);
  let payload: string | null;

  if (init.raw !== undefined) {
    payload = init.raw;
  } else if (init.body === undefined) {
    payload = status === 204 ? null : '';
  } else {
    payload = JSON.stringify(init.body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', status >= 400 ? 'application/problem+json' : 'application/json');
    }
  }

  return new Response(payload, { status, headers });
}

/** A `fetch` double that returns queued responses (or throws queued errors). */
export function createFetchMock(
  ...outcomes: Array<Response | Error | (() => Response | Promise<Response>)>
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let index = 0;

  const fn = vi.fn(
    async (input: Parameters<typeof fetch>[0], reqInit?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init: reqInit });
      const outcome = outcomes[Math.min(index, outcomes.length - 1)];
      index += 1;
      if (outcome instanceof Error) throw outcome;
      if (typeof outcome === 'function') return outcome();
      return outcome;
    },
  );

  const mock = fn as unknown as typeof fetch & {
    calls: typeof calls;
    readonly callCount: number;
  };
  Object.defineProperty(mock, 'calls', { value: calls });
  Object.defineProperty(mock, 'callCount', { get: () => calls.length });
  return mock;
}
