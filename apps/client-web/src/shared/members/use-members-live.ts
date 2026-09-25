import type { RoomStreamRoomEvent } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';

import { roomMembersKey } from '@/shared/members/room-members';
import { useRoomEvents } from '@/shared/realtime/use-realtime';

const MEMBERSHIP_EVENTS: ReadonlySet<string> = new Set([
  'member_joined',
  'member_left',
  'member_kicked',
  'member_banned',
  'member_unbanned',
  'role_changed',
]);

/**
 * Refreshes the members list of `roomId` on every membership event of that room.
 * Mounted by the room route, so it runs whether the chat or a child page is shown.
 */
export function useMembersLive(roomId: string): void {
  const queryClient = useQueryClient();

  useRoomEvents(({ roomId: eventRoomId, event }: RoomStreamRoomEvent) => {
    if (eventRoomId !== roomId || !MEMBERSHIP_EVENTS.has(event.type)) return;
    void queryClient.invalidateQueries({ queryKey: roomMembersKey(roomId) });
  });
}
