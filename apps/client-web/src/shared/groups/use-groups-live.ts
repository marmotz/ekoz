import type { RoomStreamRoomEvent } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';

import { roomGroupsKey } from '@/shared/groups/room-groups';
import { useRoomEvents } from '@/shared/realtime/use-realtime';

/**
 * Refreshes the groups of `roomId` on every `group_changed` event of that node.
 * Descendant channels of a changed space catch up through query staleness instead.
 * Mounted by the room route, so it runs whether the chat or a child page is shown.
 */
export function useGroupsLive(roomId: string): void {
  const queryClient = useQueryClient();

  useRoomEvents(({ roomId: eventRoomId, event }: RoomStreamRoomEvent) => {
    if (eventRoomId !== roomId || event.type !== 'group_changed') return;
    void queryClient.invalidateQueries({ queryKey: roomGroupsKey(roomId) });
  });
}
