import type { MessagePin } from '@ekozhq/sdk';
import { type QueryClient, useQuery } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat/api/query-keys';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The pins of a room, newest first (`GET /rooms/:id/pins`), each with its message. Kept
 * current by `useTimelineSync` (invalidated on `pin_added` / `pin_removed`, entry dropped
 * on `message_deleted` / `message_redacted`). Enabled for readers only; a refusal shows
 * nothing.
 */
export function usePins(roomId: string, enabled = true) {
  const sdk = useSdk();

  return useQuery({
    queryKey: chatKeys.pins(roomId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.messages.pins(roomId);
    },
    enabled: enabled && sdk !== null,
    // Live events only reach the cache while a chat is mounted: reopen with a fresh list.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: 'always',
    retry: false,
  });
}

/**
 * Drops the pin of a deleted message: the server emits no `pin_removed` for it. A
 * `message_redacted` event only carries the `seq` of the message, so the pin is matched
 * on its embedded message.
 */
export function removePinLocally(
  queryClient: QueryClient,
  roomId: string,
  match: { messageId: string } | { seq: string },
) {
  const matches = (pin: MessagePin) =>
    'messageId' in match ? pin.messageId === match.messageId : pin.message.seq === match.seq;
  queryClient.setQueryData<MessagePin[]>(chatKeys.pins(roomId), (current) =>
    current?.some(matches) ? current.filter((pin) => !matches(pin)) : current,
  );
}
