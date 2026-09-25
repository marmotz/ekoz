import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { roomMembersKey } from '@/shared/members/room-members';
import { useMembersLive } from '@/shared/members/use-members-live';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

function setup(roomId = 'r1') {
  const fake = createFakeSdk();
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  renderHook(() => useMembersLive(roomId), { wrapper });

  const emit = (type: string, eventRoomId = 'r1') =>
    act(() =>
      fake.streamControl.emit('room_event', {
        roomId: eventRoomId,
        feedSeq: '1',
        event: { type, roomId: eventRoomId, seq: '1', senderId: 'u1', content: {} },
      }),
    );

  return { emit, invalidate };
}

describe('useMembersLive', () => {
  it.each([
    'member_joined',
    'member_left',
    'member_kicked',
    'member_banned',
    'member_unbanned',
    'role_changed',
  ])('invalidates the members list on %s', (type) => {
    const { emit, invalidate } = setup();

    emit(type);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: roomMembersKey('r1') });
  });

  it('ignores events of other rooms', () => {
    const { emit, invalidate } = setup();

    emit('member_left', 'r2');

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('ignores events that are not about membership', () => {
    const { emit, invalidate } = setup();

    emit('message_created');

    expect(invalidate).not.toHaveBeenCalled();
  });
});
