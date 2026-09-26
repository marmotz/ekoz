import { type ConversationListItem, EkozError, type Room } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { conversationQueries } from '@/features/direct-messages/api/queries';
import { useConversations } from '@/features/direct-messages/hooks/use-conversations';
import { useSdk } from '@/shared/sdk/use-sdk';

export type ConversationAccessState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'unavailable' }
  | {
      status: 'ready';
      /** The list item (participants, admin flag), `null` when only `GET /rooms/:id` knew it. */
      conversation: ConversationListItem | null;
      room: Room;
      capabilities: readonly string[];
    };

const isConversation = (room: Room) => room.type === 'dm' || room.type === 'group_dm';

/**
 * Resolves the caller's access to a conversation (technical design 4.4): the cached
 * conversations list first, else `GET /rooms/:id`, readable when it is a `dm` /
 * `group_dm` (a recipient following a link before the first message, or a stale list).
 * `403` / `404`, or any other room type, is "not available".
 */
export function useConversationAccess(roomId: string): ConversationAccessState {
  const sdk = useSdk();
  const list = useConversations();
  const listed = list.data?.items.find((item) => item.id === roomId) ?? null;

  const detailOptions = conversationQueries.room(sdk, roomId);
  const detail = useQuery({
    ...detailOptions,
    enabled: detailOptions.enabled && list.isSuccess && listed === null,
  });
  const room = listed ?? (detail.data && isConversation(detail.data) ? detail.data : null);

  const permissionOptions = conversationQueries.permissions(sdk, roomId);
  const permissions = useQuery({
    ...permissionOptions,
    enabled: permissionOptions.enabled && room !== null,
  });

  if (list.isError) return { status: 'error', retry: () => void list.refetch() };
  if (!list.isSuccess) return { status: 'loading' };

  if (room) {
    if (permissions.isPending) return { status: 'loading' };
    return {
      status: 'ready',
      conversation: listed,
      room,
      // Without capabilities the content stays readable; the server still enforces every action.
      capabilities: permissions.data?.capabilities ?? [],
    };
  }

  if (detail.isPending) return { status: 'loading' };
  if (detail.isSuccess) return { status: 'unavailable' };
  const status = detail.error instanceof EkozError ? detail.error.status : undefined;
  if (status === 403 || status === 404) return { status: 'unavailable' };
  return { status: 'error', retry: () => void detail.refetch() };
}
