import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it } from 'vitest';

import {
  getActiveRoom,
  getReadingRoom,
  resetActiveRooms,
  setActiveRoom,
  setReadingRoom,
} from '@/shared/realtime/active-room';
import { getPresence } from '@/shared/realtime/presence-store';
import { RealtimeProvider } from '@/shared/realtime/realtime-provider';
import { useTypingUsers } from '@/shared/realtime/typing-store';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

beforeEach(() => {
  resetActiveRooms();
});

const SIGNED_IN = { identifier: 'jane/example.test', sessionId: 's1' };

function mount({ signedIn = true } = {}) {
  const fake = createFakeSdk(signedIn ? SIGNED_IN : undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk as EkozClient}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  const view = render(<RealtimeProvider />, { wrapper });
  return { fake, ...view };
}

function created(roomId: string, senderId: string | null, seq = '1') {
  return {
    roomId,
    feedSeq: seq,
    event: { type: 'message_created', roomId, seq, senderId, content: {} },
  };
}

it('connects the stream while the session is authenticated', () => {
  const { fake } = mount();

  expect(fake.streamControl.stream.connect).toHaveBeenCalledTimes(1);
});

it('does not connect an anonymous session', () => {
  const { fake } = mount({ signedIn: false });

  expect(fake.streamControl.stream.connect).not.toHaveBeenCalled();
  expect(fake.stubs.me.get).not.toHaveBeenCalled();
});

it('connects when the session becomes authenticated and disconnects when it ends', async () => {
  const { fake } = mount({ signedIn: false });
  expect(fake.streamControl.stream.connect).not.toHaveBeenCalled();

  act(() => {
    fake.setSession({ identifier: 'jane/example.test', sessionId: 's2' });
    fake.emit('session:authenticated', {} as never);
  });
  await waitFor(() => expect(fake.streamControl.stream.connect).toHaveBeenCalledTimes(1));

  act(() => {
    fake.setSession(undefined);
    fake.emit('session:cleared', {});
  });
  await waitFor(() => expect(fake.streamControl.stream.disconnect).toHaveBeenCalledTimes(1));
});

it('disconnects on unmount', () => {
  const { fake, unmount } = mount();

  unmount();

  expect(fake.streamControl.stream.disconnect).toHaveBeenCalledTimes(1);
});

it('forgets the active and reading rooms when the connection ends', () => {
  const { unmount } = mount();
  setActiveRoom('r1');
  setReadingRoom('r1');

  unmount();

  expect(getActiveRoom()).toBeNull();
  expect(getReadingRoom()).toBeNull();
});

it('does not interpret room events', () => {
  const { fake } = mount();

  act(() => fake.streamControl.emit('room_event', created('r1', 'someone-else')));

  expect(getActiveRoom()).toBeNull();
  expect(getReadingRoom()).toBeNull();
});

it('starts the presence heartbeat with the stream and stops it with it', () => {
  const { fake, unmount } = mount();
  expect(fake.reporterControl.reporter.start).toHaveBeenCalledTimes(1);

  unmount();

  expect(fake.reporterControl.reporter.stop).toHaveBeenCalledTimes(1);
});

it('does not start the heartbeat for an anonymous session', () => {
  const { fake } = mount({ signedIn: false });

  expect(fake.reporterControl.reporter.start).not.toHaveBeenCalled();
});

it('feeds the presence store from the stream and forgets it on unmount', () => {
  const { fake, unmount } = mount();

  act(() => fake.streamControl.emit('presence', { userId: 'u1', status: 'online' }));
  expect(getPresence('u1')).toBe('online');

  unmount();
  expect(getPresence('u1')).toBe('offline');
});

it('feeds the typing store from the stream, ignoring the own user', async () => {
  const { fake, unmount } = mount();
  await waitFor(() => expect(fake.stubs.me.get).toHaveBeenCalled());
  const { id } = await fake.stubs.me.get();
  // Let the query resolve and the provider re-render with the account.
  await act(async () => {});
  const users = renderHook(() => useTypingUsers('r1'));

  act(() => {
    fake.streamControl.emit('typing', { roomId: 'r1', userId: id, ttl: 6 });
    fake.streamControl.emit('typing', { roomId: 'r1', userId: 'someone', ttl: 6 });
  });
  expect(users.result.current).toEqual(['someone']);

  unmount();
  expect(users.result.current).toEqual([]);
});
