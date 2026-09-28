import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { useAuthPolicy } from '@/shared/auth/use-auth-policy';
import { SdkContext } from '@/shared/sdk/use-sdk';

const policy = { registrationMode: 'open', emailVerificationRequired: true, passwordMinLength: 12 };

function wrapper(sdk: EkozClient | null, queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
}

it('fetches the policy through the SDK', async () => {
  const policyCall = vi.fn(async () => policy);
  const sdk = { auth: { policy: policyCall } } as unknown as EkozClient;

  const { result } = renderHook(() => useAuthPolicy(), { wrapper: wrapper(sdk) });

  await waitFor(() => expect(result.current.data).toEqual(policy));
  expect(policyCall).toHaveBeenCalledTimes(1);
});

it('waits for the SDK client instead of querying', () => {
  const { result } = renderHook(() => useAuthPolicy(), { wrapper: wrapper(null) });

  expect(result.current.fetchStatus).toBe('idle');
  expect(result.current.isPending).toBe(true);
});

it('never serves a cached policy without refetching it', async () => {
  const policyCall = vi.fn(async () => policy);
  const sdk = { auth: { policy: policyCall } } as unknown as EkozClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  queryClient.setQueryData(['auth', 'policy'], policy);

  const { result } = renderHook(() => useAuthPolicy(), { wrapper: wrapper(sdk, queryClient) });

  await waitFor(() => expect(policyCall).toHaveBeenCalledTimes(1));
  expect(result.current.data).toEqual(policy);
});

it('surfaces a failed request as an error', async () => {
  const sdk = {
    auth: {
      policy: vi.fn(async () => {
        throw new Error('offline');
      }),
    },
  } as unknown as EkozClient;

  const { result } = renderHook(() => useAuthPolicy(), { wrapper: wrapper(sdk) });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
