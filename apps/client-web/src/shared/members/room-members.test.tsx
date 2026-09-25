import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import {
  fetchRoomMembers,
  MAX_MEMBER_PAGES,
  MEMBERS_PAGE_LIMIT,
  roomMembersKey,
  useRoomMembers,
} from '@/shared/members/room-members';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

const member = (id: string) => ({
  role: 'member',
  joinedAt: '',
  user: { id, identifier: null, displayName: id, avatarUrl: null },
});

it('builds the query key', () => {
  expect(roomMembersKey('r1')).toEqual(['members', 'r1']);
});

it('follows the members cursor until it is null', async () => {
  const members = vi
    .fn()
    .mockResolvedValueOnce({ items: [member('a')], nextCursor: 'c1' })
    .mockResolvedValueOnce({ items: [member('b')], nextCursor: null });
  const sdk = { rooms: { members } } as unknown as EkozClient;

  const result = await fetchRoomMembers(sdk, 'r1');

  expect(result.members.map((m) => m.user.id)).toEqual(['a', 'b']);
  expect(result.truncated).toBe(false);
  expect(members).toHaveBeenNthCalledWith(1, 'r1', { limit: MEMBERS_PAGE_LIMIT });
  expect(members).toHaveBeenNthCalledWith(2, 'r1', { limit: MEMBERS_PAGE_LIMIT, cursor: 'c1' });
});

it('stops after the maximum number of pages and reports the list as truncated', async () => {
  const members = vi.fn(async () => ({ items: [member('a')], nextCursor: 'more' }));
  const sdk = { rooms: { members } } as unknown as EkozClient;

  const result = await fetchRoomMembers(sdk, 'r1');

  expect(members).toHaveBeenCalledTimes(MAX_MEMBER_PAGES);
  expect(result.members).toHaveLength(MAX_MEMBER_PAGES);
  expect(result.truncated).toBe(true);
});

it('is not truncated when the last allowed page ends the list', async () => {
  const members = vi.fn();
  for (let page = 1; page < MAX_MEMBER_PAGES; page += 1) {
    members.mockResolvedValueOnce({ items: [member('a')], nextCursor: 'more' });
  }
  members.mockResolvedValueOnce({ items: [member('z')], nextCursor: null });
  const sdk = { rooms: { members } } as unknown as EkozClient;

  const result = await fetchRoomMembers(sdk, 'r1');

  expect(result.truncated).toBe(false);
  expect(result.members).toHaveLength(MAX_MEMBER_PAGES);
});

it('useRoomMembers loads the list through the SDK under the shared key', async () => {
  const fake = createFakeSdk();
  fake.stubs.rooms.members.mockResolvedValue({
    items: [member('a')],
    nextCursor: null,
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );

  const { result } = renderHook(() => useRoomMembers('r1'), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.members).toHaveLength(1);
  expect(queryClient.getQueryData(roomMembersKey('r1'))).toBe(result.current.data);
});

it('useRoomMembers stays idle without an SDK', () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={null}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );

  const { result } = renderHook(() => useRoomMembers('r1'), { wrapper });

  expect(result.current.fetchStatus).toBe('idle');
});
