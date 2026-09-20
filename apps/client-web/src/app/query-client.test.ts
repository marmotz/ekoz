import { AuthenticationError, EkozError, ServerError } from '@ekozhq/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/app/query-client';
import { onUnhandledAuthenticationError } from '@/app/session-signal';

function makeError<T extends EkozError>(
  Ctor: new (init: ConstructorParameters<typeof EkozError>[0]) => T,
  status: number,
) {
  return new Ctor({ code: 'test.error', status });
}

function retryDecision(
  client: ReturnType<typeof createQueryClient>,
  error: unknown,
  failureCount: number,
) {
  const retry = client.getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('retry must be a function');
  return retry(failureCount, error as Error);
}

describe('createQueryClient', () => {
  const unsubscribers: (() => void)[] = [];

  afterEach(() => {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
  });

  it('returns a distinct instance on every call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });

  it('applies the documented defaults', () => {
    const { queries } = createQueryClient().getDefaultOptions();

    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });

  it('retries a server error once', () => {
    const client = createQueryClient();
    const error = makeError(ServerError, 500);

    expect(retryDecision(client, error, 0)).toBe(true);
    expect(retryDecision(client, error, 1)).toBe(false);
  });

  it('does not retry a 4xx error', () => {
    const client = createQueryClient();

    expect(retryDecision(client, makeError(EkozError, 404), 0)).toBe(false);
    expect(retryDecision(client, makeError(EkozError, 422), 0)).toBe(false);
  });

  it('does not retry an authentication error', () => {
    expect(retryDecision(createQueryClient(), makeError(AuthenticationError, 401), 0)).toBe(false);
  });

  it('signals an unhandled authentication error from a query', async () => {
    const listener = vi.fn();
    unsubscribers.push(onUnhandledAuthenticationError(listener));
    const client = createQueryClient();
    const error = makeError(AuthenticationError, 401);

    await client
      .fetchQuery({
        queryKey: ['me'],
        queryFn: () => Promise.reject(error),
        retry: false,
      })
      .catch(() => undefined);

    expect(listener).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('does not signal other errors', async () => {
    const listener = vi.fn();
    unsubscribers.push(onUnhandledAuthenticationError(listener));

    await createQueryClient()
      .fetchQuery({
        queryKey: ['boom'],
        queryFn: () => Promise.reject(makeError(ServerError, 500)),
        retry: false,
      })
      .catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });
});
