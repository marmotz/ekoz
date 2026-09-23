import type { EkozClient } from '@ekozhq/sdk';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import {
  useAccountEvents,
  useConnectionStatus,
  useReconnected,
  useRoomEvents,
} from '@/shared/realtime/use-realtime';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

function setup() {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SdkContext.Provider value={fake.sdk as EkozClient}>{children}</SdkContext.Provider>
  );
  return { fake, wrapper };
}

const roomEvent = {
  roomId: 'r1',
  feedSeq: '1',
  event: { type: 'message_created', roomId: 'r1', seq: '1' },
};

it('delivers room events to the handler', () => {
  const { fake, wrapper } = setup();
  const handler = vi.fn();
  renderHook(() => useRoomEvents(handler), { wrapper });

  fake.streamControl.emit('room_event', roomEvent);

  expect(handler).toHaveBeenCalledWith(roomEvent);
});

it('delivers account events and reconnections', () => {
  const { fake, wrapper } = setup();
  const onAccount = vi.fn();
  const onReconnected = vi.fn();
  renderHook(
    () => {
      useAccountEvents(onAccount);
      useReconnected(onReconnected);
    },
    { wrapper },
  );

  fake.streamControl.emit('account', { roomId: 'r1', feedSeq: '2' });
  fake.streamControl.emit('reconnected');

  expect(onAccount).toHaveBeenCalledWith({ roomId: 'r1', feedSeq: '2' });
  expect(onReconnected).toHaveBeenCalledTimes(1);
});

it('calls the latest handler without resubscribing', () => {
  const { fake, wrapper } = setup();
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = renderHook(({ handler }) => useRoomEvents(handler), {
    wrapper,
    initialProps: { handler: first },
  });
  const subscriptions = fake.streamControl.stream.on.mock.calls.length;

  rerender({ handler: second });
  fake.streamControl.emit('room_event', roomEvent);

  expect(fake.streamControl.stream.on.mock.calls.length).toBe(subscriptions);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

it('unsubscribes on unmount', () => {
  const { fake, wrapper } = setup();
  const handler = vi.fn();
  const { unmount } = renderHook(() => useRoomEvents(handler), { wrapper });
  expect(fake.streamControl.listenerCount('room_event')).toBe(1);

  unmount();
  fake.streamControl.emit('room_event', roomEvent);

  expect(fake.streamControl.listenerCount('room_event')).toBe(0);
  expect(handler).not.toHaveBeenCalled();
});

it('reports the connection status and follows its changes', () => {
  const { fake, wrapper } = setup();
  const { result } = renderHook(() => useConnectionStatus(), { wrapper });
  expect(result.current).toBe('idle');

  act(() => fake.streamControl.setStatus('open'));
  expect(result.current).toBe('open');

  act(() => fake.streamControl.setStatus('reconnecting'));
  expect(result.current).toBe('reconnecting');
});

it('stays idle and inert without an SDK client', () => {
  const handler = vi.fn();
  const { result } = renderHook(
    () => {
      useRoomEvents(handler);
      return useConnectionStatus();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SdkContext.Provider value={null}>{children}</SdkContext.Provider>
      ),
    },
  );

  expect(result.current).toBe('idle');
});
