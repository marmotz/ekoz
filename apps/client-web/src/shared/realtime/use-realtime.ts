import type {
  AccountStreamEvent,
  RoomStream,
  RoomStreamRoomEvent,
  RoomStreamStatus,
} from '@ekozhq/sdk';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * Generic subscriptions over the SDK stream. Nothing here interprets an event:
 * each feature subscribes and updates its own cache. Handlers are kept in a ref,
 * so passing a fresh closure on every render does not resubscribe.
 */

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Subscribes `handler` to a stream event for the lifetime of the component. */
function useStreamEvent<Args extends unknown[]>(
  subscribe: (stream: RoomStream, listener: (...args: Args) => void) => () => void,
  handler: (...args: Args) => void,
) {
  const sdk = useSdk();
  const handlerRef = useLatest(handler);
  const subscribeRef = useLatest(subscribe);

  useEffect(() => {
    if (!sdk) return undefined;
    return subscribeRef.current(sdk.stream, (...args) => handlerRef.current(...args));
  }, [sdk, handlerRef, subscribeRef]);
}

/** Connection state of the stream; `idle` until the SDK client exists. */
export function useConnectionStatus(): RoomStreamStatus {
  const sdk = useSdk();

  const subscribe = useCallback(
    (onChange: () => void) => (sdk ? sdk.stream.on('status', onChange) : () => {}),
    [sdk],
  );

  return useSyncExternalStore(
    subscribe,
    () => sdk?.stream.status ?? 'idle',
    () => 'idle',
  );
}

/** Every durable room event, for every room the account can see. */
export function useRoomEvents(handler: (event: RoomStreamRoomEvent) => void): void {
  useStreamEvent((stream, listener) => stream.on('room_event', listener), handler);
}

/** Account-scoped notifications (invitations, join-request outcomes, ...). */
export function useAccountEvents(handler: (event: AccountStreamEvent) => void): void {
  useStreamEvent((stream, listener) => stream.on('account', listener), handler);
}

/** Fired every time the stream re-opens after a gap. */
export function useReconnected(handler: () => void): void {
  useStreamEvent((stream, listener) => stream.on('reconnected', listener), handler);
}
