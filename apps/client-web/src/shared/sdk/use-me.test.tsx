import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { useMe } from '@/shared/sdk/use-me';
import { SdkContext } from '@/shared/sdk/use-sdk';

const me = { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', isOwner: true };

function wrapper(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
}

it('fetches the signed-in account through the SDK', async () => {
  const get = vi.fn(async () => me);
  const sdk = { me: { get } } as unknown as EkozClient;

  const { result } = renderHook(() => useMe(), { wrapper: wrapper(sdk) });

  await waitFor(() => expect(result.current.data).toEqual(me));
  expect(get).toHaveBeenCalledTimes(1);
});

it('waits for the SDK client instead of querying', () => {
  const { result } = renderHook(() => useMe(), { wrapper: wrapper(null) });

  expect(result.current.fetchStatus).toBe('idle');
  expect(result.current.data).toBeUndefined();
});

it('surfaces a failed request as an error', async () => {
  const sdk = {
    me: {
      get: vi.fn(async () => {
        throw new Error('offline');
      }),
    },
  } as unknown as EkozClient;

  const { result } = renderHook(() => useMe(), { wrapper: wrapper(sdk) });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
