import type { RoomEvent, RoomStreamRoomEvent } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import {
  applyRoomEvent,
  replaceMessage,
  type Timeline,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';
import { useRoomGroups } from '@/shared/groups/room-groups';
import { useRoomMembers } from '@/shared/members/room-members';
import { viewerFromCache } from '@/shared/mentions/mentions-me';
import { useReconnected, useRoomEvents } from '@/shared/realtime/use-realtime';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';

/** Pages `/sync` may take to close a gap before the timeline is reloaded instead. */
export const MAX_SYNC_PAGES = 5;

/**
 * Keeps the room timeline current: live stream events for this room, the
 * reconnection catch-up. Mounted by
 * `RoomChat`. Every path goes through `applyRoomEvent`, whose `seq > lastSeq`
 * guard makes overlapping sources (stream, feed replay, `/sync`) harmless.
 */
export function useTimelineSync(roomId: string) {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const timelineKey = chatKeys.timeline(roomId);
  // Loaded so that `mentionsMe` can be derived from them for live messages.
  useMe();
  useRoomMembers(roomId);
  useRoomGroups(roomId);
  // Events that arrive before the first page has loaded, applied once it has.
  const buffer = useRef<RoomEvent[]>([]);

  const refetchMessages = useCallback(
    (messageIds: string[]) => {
      if (!sdk) return;
      for (const messageId of messageIds) {
        sdk.messages
          .get(roomId, messageId)
          .then((message) => {
            queryClient.setQueryData<Timeline>(timelineKey, (current) =>
              current ? replaceMessage(current, toTimelineMessage(message)) : current,
            );
          })
          .catch(() => {
            // The edit is picked up the next time the room is opened.
          });
      }
    },
    [sdk, queryClient, roomId, timelineKey],
  );

  /** Applies `event` to the cached timeline; false when there is no timeline yet. */
  const apply = useCallback(
    (event: RoomEvent): boolean => {
      const current = queryClient.getQueryData<Timeline>(timelineKey);
      if (!current) return false;

      const { timeline, refetch } = applyRoomEvent(
        current,
        event,
        viewerFromCache(queryClient, roomId),
      );
      if (timeline !== current) queryClient.setQueryData(timelineKey, timeline);
      refetchMessages(refetch);
      return true;
    },
    [queryClient, roomId, timelineKey, refetchMessages],
  );

  const flushBuffer = useCallback(() => {
    if (!queryClient.getQueryData(timelineKey)) return;
    const buffered = buffer.current;
    buffer.current = [];
    for (const event of buffered) apply(event);
  }, [queryClient, timelineKey, apply]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => flushBuffer());
    flushBuffer();
    return unsubscribe;
  }, [queryClient, flushBuffer]);

  useRoomEvents(({ roomId: eventRoomId, event }: RoomStreamRoomEvent) => {
    if (eventRoomId !== roomId) return;
    if (!apply(event)) buffer.current.push(event);
  });

  const catchUp = useCallback(async () => {
    if (!sdk) return;
    const current = queryClient.getQueryData<Timeline>(timelineKey);
    // Not loaded yet: the first page is fetched after the reconnection anyway.
    if (!current) return;

    try {
      let since = current.lastSeq;
      for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
        const result = await sdk.sync.get({ room: roomId, since });
        for (const event of result.events) apply(event);
        const last = result.events.at(-1);
        if (!last || BigInt(last.seq) >= BigInt(result.lastSeq)) return;
        since = last.seq;
      }
    } catch {
      // Fall through to a full reload below.
    }
    // The gap is larger than the pages allow, or catch-up failed: start over from the newest page.
    await queryClient.resetQueries({ queryKey: timelineKey });
  }, [sdk, queryClient, roomId, timelineKey, apply]);

  useReconnected(() => {
    void catchUp();
  });
}
