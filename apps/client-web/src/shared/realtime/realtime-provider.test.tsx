import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it } from 'vitest';

import {
  getActiveRoom,
  getReadingRoom,
  resetActiveRooms,
  setActiveRoom,
  setReadingRoom,
} from '@/shared/realtime/active-room';
import { RealtimeProvider } from '@/shared/realtime/realtime-provider';
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
