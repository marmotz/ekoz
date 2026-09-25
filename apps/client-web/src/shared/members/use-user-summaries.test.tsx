import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import {
  SUMMARIES_CHUNK_SIZE,
  userSummariesKey,
  useUserSummaries,
} from '@/shared/members/use-user-summaries';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

function setup() {
  const fake = createFakeSdk();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  return { fake, queryClient, wrapper };
}

it('stays idle without ids', () => {
  const { fake, wrapper } = setup();

  const { result } = renderHook(() => useUserSummaries([]), { wrapper });

  expect(result.current.fetchStatus).toBe('idle');
  expect(fake.stubs.users.summaries).not.toHaveBeenCalled();
});

it('fetches the distinct ids sorted, under a key made of the sorted ids', async () => {
  const { fake, queryClient, wrapper } = setup();

  const { result } = renderHook(() => useUserSummaries(['b', 'a', 'b']), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fake.stubs.users.summaries).toHaveBeenCalledTimes(1);
  expect(fake.stubs.users.summaries).toHaveBeenCalledWith(['a', 'b']);
  expect(result.current.data?.map((summary) => summary.id)).toEqual(['a', 'b']);
  expect(queryClient.getQueryData(userSummariesKey(['a', 'b']))).toBe(result.current.data);
});

it('splits more than 100 ids into chunks and keeps every summary', async () => {
  const { fake, wrapper } = setup();
  const ids = Array.from(
    { length: SUMMARIES_CHUNK_SIZE + 30 },
    (_, i) => `u${String(i).padStart(3, '0')}`,
  );

  const { result } = renderHook(() => useUserSummaries(ids), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const calls = fake.stubs.users.summaries.mock.calls;
  expect(calls.map(([chunk]) => chunk.length)).toEqual([SUMMARIES_CHUNK_SIZE, 30]);
  expect(result.current.data).toHaveLength(ids.length);
});
