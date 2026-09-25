import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { GROUPS_STALE_TIME, roomGroupsKey, useRoomGroups } from '@/shared/groups/room-groups';
import { useGroupsLive } from '@/shared/groups/use-groups-live';
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

it('builds the query key and keeps the list fresh for 30 seconds', () => {
  expect(roomGroupsKey('r1')).toEqual(['groups', 'r1']);
  expect(GROUPS_STALE_TIME).toBe(30_000);
});

it('loads the groups of the room through the SDK', async () => {
  const { fake, wrapper } = setup();
  fake.stubs.groups.list.mockResolvedValue({ items: [{ id: 'g1', name: 'design' }] } as never);

  const { result } = renderHook(() => useRoomGroups('r1'), { wrapper });

  await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
  expect(fake.stubs.groups.list).toHaveBeenCalledWith('r1');
});

it('invalidates the groups on a group_changed event of that room only', () => {
  const { fake, queryClient, wrapper } = setup();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderHook(() => useGroupsLive('r1'), { wrapper });

  const emit = (type: string, roomId: string) =>
    act(() =>
      fake.streamControl.emit('room_event', {
        roomId,
        feedSeq: '1',
        event: { type, roomId, seq: '1', senderId: 'u1', content: {} },
      }),
    );

  emit('group_changed', 'r2');
  emit('member_joined', 'r1');
  expect(invalidate).not.toHaveBeenCalled();

  emit('group_changed', 'r1');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['groups', 'r1'] });
});
