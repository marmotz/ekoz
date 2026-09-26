import type { RoomStream } from '@ekozhq/sdk';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import {
  connectPresenceStore,
  getPresence,
  resetPresence,
  setPresence,
  usePresence,
} from '@/shared/realtime/presence-store';
import { createFakeStream } from '../../../test/sdk-mock';

beforeEach(() => {
  resetPresence();
});

function connect() {
  const fake = createFakeStream();
  const disconnect = connectPresenceStore(fake.stream as unknown as RoomStream);
  return { fake, disconnect };
}

it('reads offline for an unknown user', () => {
  expect(getPresence('u1')).toBe('offline');
});

it('records the status of each presence frame', () => {
  const { fake } = connect();

  fake.emit('presence', { userId: 'u1', status: 'online' });
  fake.emit('presence', { userId: 'u2', status: 'away' });
  fake.emit('presence', { userId: 'u1', status: 'away' });

  expect(getPresence('u1')).toBe('away');
  expect(getPresence('u2')).toBe('away');
});

it('re-renders a reader of the user only when that status changes', () => {
  const { result } = renderHook(() => usePresence('u1'));
  expect(result.current).toBe('offline');

  act(() => setPresence('u1', 'online'));
  expect(result.current).toBe('online');

  act(() => setPresence('u1', 'offline'));
  expect(result.current).toBe('offline');
});

it('is offline for a missing user id', () => {
  const { result } = renderHook(() => usePresence(null));

  act(() => setPresence('u1', 'online'));

  expect(result.current).toBe('offline');
});

it('clears every status when the stream starts reconnecting, and keeps them otherwise', () => {
  const { fake } = connect();
  fake.emit('presence', { userId: 'u1', status: 'online' });

  fake.setStatus('open');
  expect(getPresence('u1')).toBe('online');

  fake.setStatus('reconnecting');
  expect(getPresence('u1')).toBe('offline');

  // The snapshot of the next connection refills it.
  fake.emit('presence', { userId: 'u1', status: 'away' });
  expect(getPresence('u1')).toBe('away');
});

it('clears the statuses and stops listening on cleanup', () => {
  const { fake, disconnect } = connect();
  fake.emit('presence', { userId: 'u1', status: 'online' });

  disconnect();

  expect(getPresence('u1')).toBe('offline');
  expect(fake.listenerCount('presence')).toBe(0);
  expect(fake.listenerCount('status')).toBe(0);
});
