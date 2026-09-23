import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { RealtimeProvider } from '@/shared/realtime/realtime-provider';
import { resetUnseenRooms, setActiveRoom, useRoomHasUnseen } from '@/shared/realtime/unseen-rooms';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk, defaultMe } from '../../../test/sdk-mock';

beforeEach(() => {
  resetUnseenRooms();
});

function Dot({ roomId }: { roomId: string }) {
  return <span data-testid={roomId}>{String(useRoomHasUnseen(roomId))}</span>;
}

const SIGNED_IN = { identifier: 'jane/example.test', sessionId: 's1' };

function mount({ signedIn = true } = {}) {
  const fake = createFakeSdk(signedIn ? SIGNED_IN : undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk as EkozClient}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  const view = render(
    <>
      <RealtimeProvider />
      <Dot roomId="r1" />
      <Dot roomId="r2" />
      <Dot roomId="probe" />
    </>,
    { wrapper },
  );
  return { fake, ...view };
}

function created(roomId: string, senderId: string | null, seq = '1') {
  return {
    roomId,
    feedSeq: seq,
    event: { type: 'message_created', roomId, seq, senderId, content: {} },
  };
}

/**
 * Waits until the caller is known: an event is only classified once `useMe` has
 * resolved, so a probe from someone else is replayed until it is flagged.
 */
async function callerKnown(
  fake: ReturnType<typeof createFakeSdk>,
  view: { getByTestId: (id: string) => HTMLElement },
) {
  await waitFor(() => {
    act(() => fake.streamControl.emit('room_event', created('probe', 'someone-else')));
    expect(view.getByTestId('probe')).toHaveTextContent('true');
  });
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

it("marks a room unseen when someone else's message arrives in it", async () => {
  const view = mount();
  const { fake, getByTestId } = view;
  await callerKnown(fake, view);

  act(() => fake.streamControl.emit('room_event', created('r1', 'someone-else')));

  expect(getByTestId('r1')).toHaveTextContent('true');
  expect(getByTestId('r2')).toHaveTextContent('false');
});

it('ignores the caller own message', async () => {
  const view = mount();
  const { fake, getByTestId } = view;
  await callerKnown(fake, view);

  act(() => fake.streamControl.emit('room_event', created('r1', defaultMe.id)));

  expect(getByTestId('r1')).toHaveTextContent('false');
});

it('ignores messages of the active room', async () => {
  const view = mount();
  const { fake, getByTestId } = view;
  await callerKnown(fake, view);
  setActiveRoom('r1');

  act(() => fake.streamControl.emit('room_event', created('r1', 'someone-else')));

  expect(getByTestId('r1')).toHaveTextContent('false');
});

it('ignores events that are not new messages', async () => {
  const view = mount();
  const { fake, getByTestId } = view;
  await callerKnown(fake, view);

  act(() =>
    fake.streamControl.emit('room_event', {
      roomId: 'r1',
      feedSeq: '1',
      event: { type: 'message_edited', roomId: 'r1', seq: '2', senderId: 'someone-else' },
    }),
  );

  expect(getByTestId('r1')).toHaveTextContent('false');
});

it('forgets unseen rooms when the connection ends', async () => {
  const view = mount();
  const { fake, getByTestId, unmount } = view;
  await callerKnown(fake, view);
  act(() => fake.streamControl.emit('room_event', created('r1', 'someone-else')));
  expect(getByTestId('r1')).toHaveTextContent('true');

  unmount();

  const probe = render(<Dot roomId="r1" />);
  expect(probe.getByTestId('r1')).toHaveTextContent('false');
});
