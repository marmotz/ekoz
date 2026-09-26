import { isDeepStrictEqual } from 'node:util';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { roomKeys } from '@/features/rooms/api/keys';
import { ROOMS_LIVE_DEBOUNCE_MS, useRoomsLive } from '@/features/rooms/hooks/use-rooms-live';
import { resetActiveRooms, setReadingRoom } from '@/shared/realtime/active-room';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { roomItem } from '../../../../test/room-fixtures';
import { createFakeSdk, defaultMe } from '../../../../test/sdk-mock';

const ME = defaultMe.id;

function setup({ meKnown = true } = {}) {
  const fake = createFakeSdk();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (meKnown) queryClient.setQueryData(ME_QUERY_KEY, { ...defaultMe });
  queryClient.setQueryData(roomKeys.list(), {
    items: [
      roomItem({ id: 'r1', unreadCount: 2 }),
      roomItem({ id: 'r2', unreadCount: 0 }),
      roomItem({ id: 'r99', unreadCount: 99 }),
      roomItem({ id: 'r100', unreadCount: 100 }),
      roomItem({ id: 'ctx', type: 'space', access: 'context', role: null, unreadCount: null }),
    ],
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useRoomsLive(), { wrapper });

  const room = (roomId: string, event: Record<string, unknown>) =>
    act(() =>
      fake.streamControl.emit('room_event', {
        roomId,
        feedSeq: '1',
        event: { roomId, seq: '5', createdAt: '2026-01-01T00:00:00.000Z', ...event },
      }),
    );
  const message = (roomId: string, senderId: string) =>
    room(roomId, {
      type: 'message_created',
      senderId,
      content: { messageId: 'm', body: 'x', replyToId: null, mentions: [] },
    });
  const receipt = (roomId: string, userId: string) =>
    room(roomId, { type: 'receipt_updated', senderId: userId, content: { userId, seq: '5' } });
  const account = (event: Record<string, unknown>) =>
    act(() => fake.streamControl.emit('account', { roomId: 'r1', feedSeq: '1', ...event }));

  const count = (id: string) =>
    queryClient
      .getQueryData<{ items: { id: string; unreadCount: number | null }[] }>(roomKeys.list())
      ?.items.find((item) => item.id === id)?.unreadCount;
  const invalidated = (key: readonly unknown[]) =>
    invalidate.mock.calls.filter(([filters]) => isDeepStrictEqual(filters?.queryKey, key)).length;

  return { fake, queryClient, hook, room, message, receipt, account, count, invalidated };
}

const flushDebounce = () => act(() => vi.advanceTimersByTimeAsync(ROOMS_LIVE_DEBOUNCE_MS));

beforeEach(() => {
  vi.useFakeTimers();
  resetActiveRooms();
});

afterEach(() => {
  vi.useRealTimers();
  resetActiveRooms();
});

describe('useRoomsLive: message_created', () => {
  it('adds one to the counter of a room that is not being read', () => {
    const { message, count } = setup();

    message('r1', 'u2');

    expect(count('r1')).toBe(3);
  });

  it('caps the counter at 100', () => {
    const { message, count } = setup();

    message('r99', 'u2');
    message('r100', 'u2');

    expect(count('r99')).toBe(100);
    expect(count('r100')).toBe(100);
  });

  it('ignores the caller own messages', () => {
    const { message, count } = setup();

    message('r1', ME);

    expect(count('r1')).toBe(2);
  });

  it('ignores a message in the room being read', () => {
    const { message, count } = setup();
    setReadingRoom('r1');

    message('r1', 'u2');

    expect(count('r1')).toBe(2);
  });

  it('counts in a room that is open but not being read', () => {
    const { message, count } = setup();
    setReadingRoom('r2');

    message('r1', 'u2');

    expect(count('r1')).toBe(3);
  });

  it('leaves a null counter and unknown rooms alone', () => {
    const { message, count, queryClient } = setup();

    message('ctx', 'u2');
    message('unknown', 'u2');

    expect(count('ctx')).toBeNull();
    expect(queryClient.getQueryData<{ items: unknown[] }>(roomKeys.list())?.items).toHaveLength(5);
  });

  it('does nothing while the rooms list is not loaded', () => {
    const { message, queryClient } = setup();
    queryClient.removeQueries({ queryKey: roomKeys.list() });

    message('r1', 'u2');

    expect(queryClient.getQueryData(roomKeys.list())).toBeUndefined();
  });

  it('is ignored until the caller is known', () => {
    const { message, count } = setup({ meKnown: false });

    message('r1', 'u2');

    expect(count('r1')).toBe(2);
  });
});

describe('useRoomsLive: receipt_updated', () => {
  it('zeroes the room being read on the caller own receipt', () => {
    const { receipt, count, invalidated } = setup();
    setReadingRoom('r1');

    receipt('r1', ME);

    expect(count('r1')).toBe(0);
    expect(invalidated(roomKeys.list())).toBe(0);
  });

  it('refreshes the list, debounced, on the caller own receipt elsewhere', async () => {
    const { receipt, count, invalidated } = setup();
    setReadingRoom('r2');

    receipt('r1', ME);
    receipt('r1', ME);
    expect(invalidated(roomKeys.list())).toBe(0);
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(1);
    expect(count('r1')).toBe(2);
  });

  it('refreshes the list when no room is being read (another device)', async () => {
    const { receipt, invalidated } = setup();

    receipt('r1', ME);
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(1);
  });

  it('ignores the receipts of other users', async () => {
    const { receipt, count, invalidated } = setup();
    setReadingRoom('r1');

    receipt('r1', 'u2');
    await flushDebounce();

    expect(count('r1')).toBe(2);
    expect(invalidated(roomKeys.list())).toBe(0);
  });

  it('is ignored until the caller is known', async () => {
    const { receipt, count, invalidated } = setup({ meKnown: false });
    setReadingRoom('r1');

    receipt('r1', ME);
    await flushDebounce();

    expect(count('r1')).toBe(2);
    expect(invalidated(roomKeys.list())).toBe(0);
  });
});

describe('useRoomsLive: structural events', () => {
  it.each([
    'room_created',
    'room_updated',
    'room_moved',
    'room_deleted',
    'member_joined',
    'member_left',
    'member_kicked',
    'member_banned',
    'role_changed',
  ])('refreshes the list on %s', async (type) => {
    const { room, invalidated } = setup();

    room('r1', { type, senderId: 'u2', content: {} });
    expect(invalidated(roomKeys.list())).toBe(0);
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(1);
  });

  it('coalesces a burst into one refresh', async () => {
    const { room, invalidated } = setup();

    room('r1', { type: 'member_joined', senderId: 'u2', content: {} });
    room('r2', { type: 'room_updated', senderId: 'u2', content: {} });
    room('r1', { type: 'role_changed', senderId: 'u2', content: {} });
    await flushDebounce();
    room('r1', { type: 'member_left', senderId: 'u2', content: {} });
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(2);
  });

  it('works without a known caller', async () => {
    const { room, invalidated } = setup({ meKnown: false });

    room('r1', { type: 'room_created', senderId: 'u2', content: {} });
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(1);
  });

  it('ignores the events that do not change the list', async () => {
    const { room, invalidated } = setup();

    room('r1', { type: 'message_edited', senderId: 'u2', content: { messageId: 'm' } });
    room('r1', { type: 'reaction_added', senderId: 'u2', content: {} });
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(0);
  });
});

describe('useRoomsLive: account frames and reconnection', () => {
  it('refreshes the invitations on invitation_created', () => {
    const { account, invalidated } = setup();

    account({ type: 'invitation_created', invitationId: 'i1' });

    expect(invalidated(roomKeys.invitations())).toBe(1);
    expect(invalidated(roomKeys.list())).toBe(0);
  });

  it('refreshes the invitations and the list on join_request_resolved', async () => {
    const { account, invalidated } = setup();

    account({ type: 'join_request_resolved', requestId: 'j1', approved: true });
    await flushDebounce();

    expect(invalidated(roomKeys.invitations())).toBe(1);
    expect(invalidated(roomKeys.list())).toBe(1);
  });

  it('ignores an unknown account frame', async () => {
    const { account, invalidated } = setup();

    account({ type: 'something_else' });
    await flushDebounce();

    expect(invalidated(roomKeys.invitations())).toBe(0);
    expect(invalidated(roomKeys.list())).toBe(0);
  });

  it('refreshes both on reconnection, without waiting', () => {
    const { fake, invalidated } = setup();

    act(() => fake.streamControl.emit('reconnected'));

    expect(invalidated(roomKeys.list())).toBe(1);
    expect(invalidated(roomKeys.invitations())).toBe(1);
  });

  it('does not refresh twice when a reconnection follows a pending refresh', async () => {
    const { fake, room, invalidated } = setup();

    room('r1', { type: 'member_joined', senderId: 'u2', content: {} });
    act(() => fake.streamControl.emit('reconnected'));
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(1);
  });

  it('unsubscribes and drops a pending refresh on unmount', async () => {
    const { fake, room, hook, invalidated } = setup();
    room('r1', { type: 'member_joined', senderId: 'u2', content: {} });

    hook.unmount();
    await flushDebounce();

    expect(invalidated(roomKeys.list())).toBe(0);
    expect(fake.streamControl.listenerCount('room_event')).toBe(0);
    expect(fake.streamControl.listenerCount('account')).toBe(0);
    expect(fake.streamControl.listenerCount('reconnected')).toBe(0);
  });
});
