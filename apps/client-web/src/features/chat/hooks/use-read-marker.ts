import { useCallback, useEffect, useRef } from 'react';

import { compareSeq, type Timeline } from '@/features/chat/lib/timeline';
import { useWindowActive } from '@/shared/lib/use-window-active';
import { getReadingRoom, setReadingRoom } from '@/shared/realtime/active-room';
import { useSdk } from '@/shared/sdk/use-sdk';

/** Quiet time, in milliseconds, before the marker is sent. */
export const READ_MARKER_DEBOUNCE_MS = 1000;

/**
 * Sends the caller's read marker while the newest message of the room is on screen
 * (web-client-read-state technical design C2). Reading means: timeline loaded, list
 * pinned to the bottom, window visible and focused. While reading, the room is
 * published as the reading room, and the `seq` of the newest confirmed message is
 * sent after a trailing debounce.
 *
 * The target is never `timeline.lastSeq`: the `receipt_updated` caused by our own
 * `PUT` advances it, which would send another `PUT` forever. Sending is monotonic,
 * like the server. A failure is swallowed and retried on the next change. A pending
 * send is flushed when the window is hidden or the chat unmounts.
 */
export function useReadMarker(
  roomId: string,
  timeline: Timeline | undefined,
  atBottom: boolean,
): void {
  const sdk = useSdk();
  const windowActive = useWindowActive();
  const reading = timeline !== undefined && atBottom && windowActive;
  const target = timeline?.messages.at(-1)?.seq ?? null;

  const lastSent = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!reading) return undefined;
    setReadingRoom(roomId);
    return () => {
      if (getReadingRoom() === roomId) setReadingRoom(null);
    };
  }, [reading, roomId]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const seq = pending.current;
    pending.current = null;
    if (seq === null || !sdk) return;
    if (lastSent.current !== null && compareSeq(seq, lastSent.current) <= 0) return;

    const previous = lastSent.current;
    lastSent.current = seq;
    sdk.receipts.set(roomId, seq).catch(() => {
      // Nothing is shown; the next change of the target sends again.
      if (lastSent.current === seq) lastSent.current = previous;
    });
  }, [sdk, roomId]);

  useEffect(() => {
    if (!reading || target === null) return undefined;
    if (lastSent.current !== null && compareSeq(target, lastSent.current) <= 0) return undefined;
    pending.current = target;
    timer.current = setTimeout(flush, READ_MARKER_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [reading, target, flush]);

  useEffect(() => {
    if (!windowActive) flush();
  }, [windowActive, flush]);

  // Leaving the room (or unmounting) sends what is pending and forgets the room's state.
  useEffect(
    () => () => {
      flush();
      lastSent.current = null;
    },
    [flush],
  );
}
