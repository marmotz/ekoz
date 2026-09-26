import type { ConversationListResponse } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';

import { conversationKeys } from '@/features/direct-messages/api/keys';
import { markUnseen } from '@/features/direct-messages/lib/unseen-store';
import { getActiveRoom, getReadingRoom } from '@/shared/realtime/active-room';
import { useReconnected, useRoomEvents } from '@/shared/realtime/use-realtime';
import { useMe } from '@/shared/sdk/use-me';

/**
 * Key of the rooms list cache (`features/rooms`). A feature may not import another, so the
 * one read this hook needs, "is this room a known space or channel?", uses the key itself.
 */
const ROOMS_LIST_KEY = ['rooms', 'list'] as const;

/** Events on a listed conversation that change what `GET /me/conversations` returns. */
const LISTED_EVENTS: ReadonlySet<string> = new Set([
  'room_updated',
  'member_joined',
  'member_kicked',
  'member_left',
  'permission_override_changed',
]);

export type ConversationGone = 'deleted' | 'removed';

export interface UseConversationsLiveOptions {
  /** The conversation the user has open was deleted, or they were removed from it. */
  onGone?: (reason: ConversationGone, roomId: string) => void;
}

/**
 * Keeps the conversations list current from the live stream (technical design 4.8):
 * - a `message_created` in a room known to neither the conversations nor the rooms list
 *   (a new or reappearing conversation) refetches the list;
 * - a foreign `message_created` in a listed conversation that is not being read gets the
 *   sidebar dot;
 * - room, member and permission events on a listed conversation refetch the list, and
 *   `room_deleted` refetches it whatever the room;
 * - when the active conversation is deleted, or the caller is removed from it, `onGone` fires;
 * - a reconnection refetches the list.
 *
 * `room_created` of a `group_dm` refetches the list (every member sees a new group at once);
 * a `dm` one is ignored, a `dm` showing for its recipient from its first message.
 * Mounted once by the `_app` layout.
 */
export function useConversationsLive({ onGone }: UseConversationsLiveOptions = {}): void {
  const queryClient = useQueryClient();
  const meId = useMe().data?.id;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
  const listed = (roomId: string) =>
    queryClient
      .getQueryData<ConversationListResponse>(conversationKeys.list())
      ?.items.some((item) => item.id === roomId) ?? false;
  const inRoomsList = (roomId: string) =>
    queryClient
      .getQueryData<{ items: { id: string }[] }>(ROOMS_LIST_KEY)
      ?.items.some((item) => item.id === roomId) ?? false;

  useRoomEvents(({ roomId, event }) => {
    if (event.type === 'room_created') {
      if ((event.content as { type?: string } | null)?.type === 'group_dm') refresh();
      return;
    }

    if (event.type === 'message_created') {
      if (listed(roomId)) {
        const foreign = meId !== undefined && event.senderId !== meId;
        if (foreign && roomId !== getReadingRoom()) markUnseen(roomId);
      } else if (!inRoomsList(roomId)) {
        refresh();
      }
      return;
    }

    if (event.type === 'room_deleted') {
      refresh();
      if (roomId === getActiveRoom()) onGone?.('deleted', roomId);
      return;
    }

    if (!LISTED_EVENTS.has(event.type) || !listed(roomId)) return;
    refresh();
    void queryClient.invalidateQueries({ queryKey: conversationKeys.permissions(roomId) });

    const content = event.content as { userId?: string } | null;
    const removed =
      (event.type === 'member_kicked' || event.type === 'member_left') &&
      meId !== undefined &&
      content?.userId === meId;
    if (removed && roomId === getActiveRoom()) onGone?.('removed', roomId);
  });

  useReconnected(refresh);
}
