import { EkozError, type MentionTarget, NetworkError } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { toMentionInputs } from '@/features/chat/lib/mention-node';
import {
  addPending,
  markPendingFailed,
  markPendingSending,
  reconcilePending,
  type SendFailureReason,
  type Timeline,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';
import { useSdk } from '@/shared/sdk/use-sdk';

const REASON_BY_CODE: Record<string, SendFailureReason> = {
  'room.read_only': 'read_only',
  'room.permission_denied': 'permission_denied',
  'message.body_too_long': 'body_too_long',
  'message.body_invalid': 'body_invalid',
  'message.mention_not_member': 'mention_invalid',
  'message.mention_invalid': 'mention_invalid',
};

export function toFailureReason(error: unknown): SendFailureReason {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof EkozError) return REASON_BY_CODE[error.code] ?? 'unknown';
  return 'unknown';
}

let localCounter = 0;

/**
 * Optimistic send. The message shows at once as a pending entry of the room
 * timeline; on success the entry is replaced by the confirmed message (idempotent
 * with the stream, which may deliver it first), on failure it is kept as `failed`
 * with a reason and can be retried. The targets of the body are sent as `mentions`.
 */
export function useSendMessage(roomId: string) {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const key = chatKeys.timeline(roomId);

  const update = useCallback(
    (change: (timeline: Timeline) => Timeline) => {
      queryClient.setQueryData<Timeline>(key, (current) => (current ? change(current) : current));
    },
    [queryClient, key],
  );

  const deliver = useCallback(
    async (localId: string, body: string, mentions: MentionTarget[]) => {
      if (!sdk) return;
      try {
        const message = await sdk.messages.send(roomId, {
          body,
          ...(mentions.length > 0 ? { mentions: toMentionInputs(mentions) } : {}),
        });
        update((timeline) => reconcilePending(timeline, localId, toTimelineMessage(message)));
      } catch (error) {
        const reason = toFailureReason(error);
        // The limit was lowered on the server: pick the new one up.
        if (reason === 'body_too_long') {
          void queryClient.invalidateQueries({ queryKey: chatKeys.messagesPolicy() });
        }
        update((timeline) => markPendingFailed(timeline, localId, reason));
      }
    },
    [sdk, roomId, update, queryClient],
  );

  const send = useCallback(
    ({ body, mentions }: { body: string; mentions: MentionTarget[] }) => {
      localCounter += 1;
      const localId = `local-${Date.now()}-${localCounter}`;
      update((timeline) => addPending(timeline, { localId, body, mentions, state: 'sending' }));
      return deliver(localId, body, mentions);
    },
    [update, deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const timeline = queryClient.getQueryData<Timeline>(key);
      const entry = timeline?.pending.find((pending) => pending.localId === localId);
      if (entry?.state !== 'failed') return Promise.resolve();
      update((current) => markPendingSending(current, localId));
      return deliver(localId, entry.body, entry.mentions);
    },
    [queryClient, key, update, deliver],
  );

  return { send, retry };
}
