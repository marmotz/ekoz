import type { RoomStreamRoomEvent } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { deriveMentionsMe, viewerFromCache } from '@/shared/mentions/mentions-me';
import {
  myMentionsKey,
  type RoomUnreadMentions,
  unreadMentionsKey,
  unreadOfRoom,
} from '@/shared/mentions/unread-mentions';
import { getActiveRoom } from '@/shared/realtime/active-room';
import { useRoomEvents } from '@/shared/realtime/use-realtime';
import { ME_QUERY_KEY, useMe } from '@/shared/sdk/use-me';

/** At most one refetch of the counters per this many milliseconds. */
export const UNREAD_MENTIONS_COALESCE_MS = 1000;

const CONTENT_CHANGES: ReadonlySet<string> = new Set([
  'message_edited',
  'message_deleted',
  'message_redacted',
]);

const isNonZero = ({ direct, collective }: RoomUnreadMentions) => direct + collective > 0;

/**
 * Keeps the unread mention counters and "My mentions" current from the live stream
 * (web-client-mentions technical design C5). Invalidates them, coalesced to one refetch
 * per second, on:
 * - a `message_created` that concerns the caller, outside the open room (there the
 *   caller sees it, and the read marker follows);
 * - the caller's own `receipt_updated`;
 * - an edit or deletion in a room that has unread mentions.
 *
 * Mounted once by the `_app` layout.
 */
export function useUnreadMentionsLive(): void {
  const queryClient = useQueryClient();
  useMe();
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = () => {
    lastRun.current = Date.now();
    void queryClient.invalidateQueries({ queryKey: unreadMentionsKey });
    void queryClient.invalidateQueries({ queryKey: myMentionsKey });
  };

  const request = () => {
    if (timer.current !== undefined) return;
    const wait = lastRun.current + UNREAD_MENTIONS_COALESCE_MS - Date.now();
    if (wait <= 0) {
      flush();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      flush();
    }, wait);
  };

  useRoomEvents(({ roomId, event }: RoomStreamRoomEvent) => {
    if (event.type === 'message_created') {
      if (roomId === getActiveRoom()) return;
      // The members and groups of a room that was never opened are not cached: a role or
      // group target then counts as possibly concerning the caller (a refetch settles it).
      const concerns = deriveMentionsMe(
        event.content.mentions,
        event.senderId,
        viewerFromCache(queryClient, roomId),
        { unresolved: 'match' },
      );
      if (concerns !== null) request();
      return;
    }

    if (event.type === 'receipt_updated') {
      const me = queryClient.getQueryData<{ id: string }>(ME_QUERY_KEY);
      if (me && event.senderId === me.id) request();
      return;
    }

    if (CONTENT_CHANGES.has(event.type)) {
      const unread = queryClient.getQueryData<{
        items: (RoomUnreadMentions & { roomId: string })[];
      }>(unreadMentionsKey);
      if (isNonZero(unreadOfRoom(unread, roomId))) request();
    }
  });
}
