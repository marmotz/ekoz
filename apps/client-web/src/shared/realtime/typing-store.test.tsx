import type { RoomStream } from '@ekozhq/sdk';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  connectTypingStore,
  resetTyping,
  useRoomHasTyping,
  useTypingUsers,
} from '@/shared/realtime/typing-store';
import { createFakeStream } from '../../../test/sdk-mock';

beforeEach(() => {
  vi.useFakeTimers();
  resetTyping();
});
afterEach(() => {
  resetTyping();
  vi.useRealTimers();
});

function connect(ownUserId: string | undefined = 'me') {
  const fake = createFakeStream();
  const disconnect = connectTypingStore(fake.stream as unknown as RoomStream, () => ownUserId);
  const users = renderHook(() => useTypingUsers('r1'));
  const has = renderHook(() => useRoomHasTyping('r1'));
  return { fake, disconnect, users, has };
}

const typing = (userId: string, roomId = 'r1', ttl = 6) => ({ roomId, userId, ttl });
const created = (roomId: string, senderId: string | null) => ({
  roomId,
  feedSeq: '1',
  event: { type: 'message_created', roomId, seq: '1', senderId, content: {} },
});

it('lists the users typing in the room, per room', () => {
  const { fake, users, has } = connect();

  act(() => {
    fake.emit('typing', typing('a'));
    fake.emit('typing', typing('b'));
    fake.emit('typing', typing('c', 'r2'));
  });

  expect(users.result.current).toEqual(['a', 'b']);
  expect(has.result.current).toBe(true);
});

it('is empty for a room nobody types in', () => {
  const { users, has } = connect();

  expect(users.result.current).toEqual([]);
  expect(has.result.current).toBe(false);
});

it('ignores the signed-in user', () => {
  const { fake, users } = connect('me');

  act(() => fake.emit('typing', typing('me')));

  expect(users.result.current).toEqual([]);
});

it('removes a user at the end of the frame ttl, and a new frame extends it', () => {
  const { fake, users } = connect();

  act(() => fake.emit('typing', typing('a', 'r1', 6)));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  act(() => fake.emit('typing', typing('a', 'r1', 6)));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(users.result.current).toEqual(['a']);

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(users.result.current).toEqual([]);
});

it('removes a user as soon as they post a message in that room', () => {
  const { fake, users } = connect();
  act(() => {
    fake.emit('typing', typing('a'));
    fake.emit('typing', typing('b'));
  });

  act(() => fake.emit('room_event', created('r2', 'a')));
  expect(users.result.current).toEqual(['a', 'b']);

  act(() => fake.emit('room_event', created('r1', 'a')));
  expect(users.result.current).toEqual(['b']);
});

it('clears everyone when the stream starts reconnecting', () => {
  const { fake, users } = connect();
  act(() => fake.emit('typing', typing('a')));

  act(() => fake.setStatus('reconnecting'));

  expect(users.result.current).toEqual([]);
});

it('keeps a stable snapshot while nothing changes', () => {
  const { fake, users } = connect();
  act(() => fake.emit('typing', typing('a')));
  const first = users.result.current;

  users.rerender();

  expect(users.result.current).toBe(first);
});

it('clears the state and stops listening on cleanup', () => {
  const { fake, disconnect, users } = connect();
  act(() => fake.emit('typing', typing('a')));

  act(() => disconnect());

  expect(users.result.current).toEqual([]);
  expect(fake.listenerCount('typing')).toBe(0);
  expect(fake.listenerCount('room_event')).toBe(0);
  expect(fake.listenerCount('status')).toBe(0);
});
