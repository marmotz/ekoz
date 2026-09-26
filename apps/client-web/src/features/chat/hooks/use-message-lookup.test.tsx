import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatKeys } from '@/features/chat/api/query-keys';
import { useMessageLookup } from '@/features/chat/hooks/use-message-lookup';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

const parent = {
  id: 'm1',
  roomId: 'r1',
  authorId: 'u1',
  body: 'hello',
  mentions: [],
  redactedAt: null,
};

function setup(timeline?: unknown) {
  const fake = createFakeSdk();
  fake.stubs.messages.get.mockRejectedValue(new Error('nope'));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (timeline) queryClient.setQueryData(chatKeys.timeline('r1'), timeline);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  return { fake, ...renderHook(() => useMessageLookup('r1', 'm1'), { wrapper }) };
}

afterEach(() => vi.restoreAllMocks());

describe('useMessageLookup', () => {
  it('reads the timeline without a queryFn warning when the timeline is not cached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = setup();

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(error).not.toHaveBeenCalled();
  });

  it('serves the message from the loaded timeline without fetching it', () => {
    const { fake, result } = setup({ messages: [parent], pending: [] });

    expect(result.current.status).toBe('loaded');
    expect(result.current.message?.id).toBe('m1');
    expect(fake.stubs.messages.get).not.toHaveBeenCalled();
  });
});
