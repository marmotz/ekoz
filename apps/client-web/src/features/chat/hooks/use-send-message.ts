import { EkozError, NetworkError } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
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
 * with a reason and can be retried. `mentions` are never sent (out of scope).
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
    async (localId: string, body: string) => {
      if (!sdk) return;
      try {
        const message = await sdk.messages.send(roomId, { body });
        update((timeline) => reconcilePending(timeline, localId, toTimelineMessage(message)));
      } catch (error) {
        update((timeline) => markPendingFailed(timeline, localId, toFailureReason(error)));
      }
    },
    [sdk, roomId, update],
  );

  const send = useCallback(
    (body: string) => {
      localCounter += 1;
      const localId = `local-${Date.now()}-${localCounter}`;
      update((timeline) => addPending(timeline, { localId, body, state: 'sending' }));
      return deliver(localId, body);
    },
    [update, deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const timeline = queryClient.getQueryData<Timeline>(key);
      const entry = timeline?.pending.find((pending) => pending.localId === localId);
      if (entry?.state !== 'failed') return Promise.resolve();
      update((current) => markPendingSending(current, localId));
      return deliver(localId, entry.body);
    },
    [queryClient, key, update, deliver],
  );

  return { send, retry };
}
