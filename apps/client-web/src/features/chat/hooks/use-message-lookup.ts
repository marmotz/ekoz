import type { Message } from '@ekozhq/sdk';
import { skipToken, useQuery } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat/api/query-keys';
import {
  type Timeline,
  type TimelineMessage,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * A message of the room by id: from the loaded timeline when it is there, else fetched
 * once (`GET /rooms/:id/messages/:id`) and cached under `chatKeys.message`. Used to quote
 * the parent of a reply, which may be outside the loaded page. `useTimelineSync`
 * invalidates the fetched entry when the message is edited or deleted.
 */
export function useMessageLookup(roomId: string, messageId: string) {
  const sdk = useSdk();

  // Reads the timeline entry reactively without ever fetching it (`skipToken`).
  const inTimeline = useQuery<Timeline, Error, TimelineMessage | undefined>({
    queryKey: chatKeys.timeline(roomId),
    queryFn: skipToken,
    select: (timeline) => timeline.messages.find((message) => message.id === messageId),
  });
  const loaded = inTimeline.data;

  const fetched = useQuery<Message, Error, TimelineMessage>({
    queryKey: chatKeys.message(roomId, messageId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.messages.get(roomId, messageId);
    },
    select: toTimelineMessage,
    enabled: sdk !== null && loaded === undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  if (loaded) return { message: loaded, status: 'loaded' as const };
  if (fetched.data) return { message: fetched.data, status: 'loaded' as const };
  if (fetched.isError) return { message: undefined, status: 'error' as const };
  return { message: undefined, status: 'loading' as const };
}
