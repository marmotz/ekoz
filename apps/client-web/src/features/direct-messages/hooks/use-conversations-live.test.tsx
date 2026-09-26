import { isDeepStrictEqual } from 'node:util';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationKeys } from '@/features/direct-messages/api/keys';
import { useConversationsLive } from '@/features/direct-messages/hooks/use-conversations-live';
import { resetUnseen, useIsUnseen } from '@/features/direct-messages/lib/unseen-store';
import { resetActiveRooms, setActiveRoom, setReadingRoom } from '@/shared/realtime/active-room';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { conversationItem } from '../../../../test/conversation-fixtures';
import { roomItem } from '../../../../test/room-fixtures';
import { createFakeSdk, defaultMe } from '../../../../test/sdk-mock';

const ME = defaultMe.id;

function setup({ onGone }: { onGone?: (reason: string, roomId: string) => void } = {}) {
  const fake = createFakeSdk();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, { ...defaultMe });
  queryClient.setQueryData(conversationKeys.list(), { items: [conversationItem({ id: 'c1' })] });
  queryClient.setQueryData(['rooms', 'list'], { items: [roomItem({ id: 'r1' })] });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  renderHook(() => useConversationsLive({ onGone }), { wrapper });

  const room = (roomId: string, event: Record<string, unknown>) =>
    act(() =>
      fake.streamControl.emit('room_event', {
        roomId,
        feedSeq: '1',
        event: { roomId, seq: '5', createdAt: '2026-01-01T00:00:00.000Z', ...event },
      }),
    );
  const invalidated = (key: readonly unknown[]) =>
    invalidate.mock.calls.filter(([filters]) => isDeepStrictEqual(filters?.queryKey, key)).length;

  return { fake, room, invalidated };
}

const message = (senderId: string) => ({
  type: 'message_created',
  senderId,
  content: { messageId: 'm', body: 'x', replyToId: null, mentions: [] },
});
const LIST = conversationKeys.list();

beforeEach(() => {
  resetActiveRooms();
  resetUnseen();
});

afterEach(() => {
  resetActiveRooms();
  resetUnseen();
});

describe('useConversationsLive', () => {
  it('refetches the list on a message in a room known to neither list', () => {
    const { room, invalidated } = setup();

    room('new-dm', message('u2'));

    expect(invalidated(LIST)).toBe(1);
  });

  it('ignores a message in a listed conversation or in a known room', () => {
    const { room, invalidated } = setup();

    room('c1', message('u2'));
    room('r1', message('u2'));

    expect(invalidated(LIST)).toBe(0);
  });

  it('ignores the room_created of a dm', () => {
    const { room, invalidated } = setup();

    room('new-dm', { type: 'room_created', senderId: 'u2', content: { type: 'dm' } });

    expect(invalidated(LIST)).toBe(0);
  });

  it('refetches the list on the room_created of a group_dm', () => {
    const { room, invalidated } = setup();

    room('new-group', { type: 'room_created', senderId: 'u2', content: { type: 'group_dm' } });

    expect(invalidated(LIST)).toBe(1);
  });

  it.each([
    ['room_updated', { name: 'x' }],
    ['member_joined', { userId: 'u9', role: 'member' }],
    ['member_kicked', { userId: 'u9' }],
    ['member_left', { userId: 'u9' }],
    ['permission_override_changed', { scope: 'user', userId: 'u9' }],
  ])('refetches the list on %s in a listed conversation', (type, content) => {
    const { room, invalidated } = setup();

    room('c1', { type, senderId: 'u2', content });

    expect(invalidated(LIST)).toBe(1);
    expect(invalidated(conversationKeys.permissions('c1'))).toBe(1);
  });

  it('ignores those events in a room that is not a listed conversation', () => {
    const { room, invalidated } = setup();

    room('r1', { type: 'room_updated', senderId: 'u2', content: {} });

    expect(invalidated(LIST)).toBe(0);
  });

  it('refetches the list on room_deleted, whatever the room', () => {
    const { room, invalidated } = setup();

    room('unlisted', { type: 'room_deleted', senderId: 'u2', content: {} });

    expect(invalidated(LIST)).toBe(1);
  });

  it('refetches on reconnection', () => {
    const { fake, invalidated } = setup();

    act(() => fake.streamControl.emit('reconnected'));

    expect(invalidated(LIST)).toBe(1);
  });

  it('reports the active conversation deleted', () => {
    const onGone = vi.fn();
    const { room } = setup({ onGone });
    setActiveRoom('c1');

    room('c1', { type: 'room_deleted', senderId: 'u2', content: {} });

    expect(onGone).toHaveBeenCalledWith('deleted', 'c1');
  });

  it('does not report the deletion of a conversation that is not open', () => {
    const onGone = vi.fn();
    const { room } = setup({ onGone });
    setActiveRoom('other');

    room('c1', { type: 'room_deleted', senderId: 'u2', content: {} });

    expect(onGone).not.toHaveBeenCalled();
  });

  it('reports the caller removed from the active conversation, not someone else', () => {
    const onGone = vi.fn();
    const { room } = setup({ onGone });
    setActiveRoom('c1');

    room('c1', { type: 'member_kicked', senderId: 'u2', content: { userId: 'u9' } });
    expect(onGone).not.toHaveBeenCalled();

    room('c1', { type: 'member_kicked', senderId: 'u2', content: { userId: ME } });
    expect(onGone).toHaveBeenCalledWith('removed', 'c1');
  });
});

describe('useConversationsLive unseen dot', () => {
  const unseenAfter = (event: () => void) => {
    const { result } = renderHook(() => useIsUnseen('c1'));
    event();
    return result.current;
  };

  it('marks a foreign message in a listed conversation that is not being read', () => {
    const { room } = setup();

    expect(unseenAfter(() => room('c1', message('u2')))).toBe(true);
  });

  it('does not mark the caller own message', () => {
    const { room } = setup();

    expect(unseenAfter(() => room('c1', message(ME)))).toBe(false);
  });

  it('does not mark a conversation being read', () => {
    const { room } = setup();
    setReadingRoom('c1');

    expect(unseenAfter(() => room('c1', message('u2')))).toBe(false);
  });
});
