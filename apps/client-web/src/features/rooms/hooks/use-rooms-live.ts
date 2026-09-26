import type { RoomListItem } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { roomKeys } from '@/features/rooms/api/keys';
import { getReadingRoom } from '@/shared/realtime/active-room';
import { useAccountEvents, useReconnected, useRoomEvents } from '@/shared/realtime/use-realtime';
import { useMe } from '@/shared/sdk/use-me';

/** At most one refetch of the rooms list per this many milliseconds. */
export const ROOMS_LIVE_DEBOUNCE_MS = 500;

/** The server counts up to this many unread messages; the badge shows `99+` from here. */
const UNREAD_CAP = 100;

/** Room events that change what `GET /rooms` returns (tree, names, roles, membership). */
const STRUCTURAL: ReadonlySet<string> = new Set([
  'room_created',
  'room_updated',
  'room_moved',
  'room_deleted',
  'member_joined',
  'member_left',
  'member_kicked',
  'member_banned',
  'role_changed',
]);

interface RoomListCache {
  items: RoomListItem[];
}

/**
 * Keeps the rooms list, the unread counters and the invitations current from the live
 * stream (web-client-read-state technical design C3). Only the `roomKeys` caches are
 * written:
 * - a foreign `message_created` adds one to the room counter (capped), unless the room
 *   is being read;
 * - the caller's own `receipt_updated` zeroes the counter of the room being read, and
 *   otherwise (another device, a partial read) refetches the list;
 * - structural room and member events refetch the list, coalesced to one per 500 ms;
 * - account frames refetch the invitations (and the list when a join request resolves);
 * - a reconnection refetches both.
 *
 * `message_created` and `receipt_updated` are ignored until the caller is known: own and
 * foreign events cannot be told apart before. Mounted once by the `_app` layout.
 */
export function useRoomsLive(): void {
  const queryClient = useQueryClient();
  const meId = useMe().data?.id;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const refreshList = () => {
    if (timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void queryClient.invalidateQueries({ queryKey: roomKeys.list() });
    }, ROOMS_LIVE_DEBOUNCE_MS);
  };

  const refreshInvitations = () =>
    void queryClient.invalidateQueries({ queryKey: roomKeys.invitations() });

  const patchUnread = (roomId: string, next: (current: number) => number) =>
    queryClient.setQueryData<RoomListCache>(roomKeys.list(), (current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === roomId && item.unreadCount !== null
                ? { ...item, unreadCount: next(item.unreadCount) }
                : item,
            ),
          }
        : current,
    );

  useRoomEvents(({ roomId, event }) => {
    if (event.type === 'message_created') {
      if (meId === undefined || event.senderId === meId) return;
      if (roomId === getReadingRoom()) return;
      patchUnread(roomId, (count) => Math.min(count + 1, UNREAD_CAP));
      return;
    }

    if (event.type === 'receipt_updated') {
      if (meId === undefined || event.content.userId !== meId) return;
      if (roomId === getReadingRoom()) patchUnread(roomId, () => 0);
      else refreshList();
      return;
    }

    if (STRUCTURAL.has(event.type)) refreshList();
  });

  useAccountEvents((event) => {
    if (event.type === 'invitation_created') {
      refreshInvitations();
    } else if (event.type === 'join_request_resolved') {
      refreshInvitations();
      refreshList();
    }
  });

  useReconnected(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    refreshInvitations();
    void queryClient.invalidateQueries({ queryKey: roomKeys.list() });
  });
}
