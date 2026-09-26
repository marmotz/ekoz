import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { type ReadMarker, readersBySeq, upsertMarker } from '@/features/chat/lib/receipts';
import type { TimelineMessage } from '@/features/chat/lib/timeline';
import { useRoomMembers } from '@/shared/members/room-members';
import { useReconnected, useRoomEvents } from '@/shared/realtime/use-realtime';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';

const NO_READERS: ReadonlyMap<string, string[]> = new Map();

/** The read markers of a room (`GET /rooms/:id/receipts`), including users who left. */
export function useReceipts(roomId: string) {
  const sdk = useSdk();

  return useQuery<ReadMarker[]>({
    queryKey: chatKeys.receipts(roomId),
    queryFn: async () => {
      if (!sdk) throw new Error('SDK not started');
      const markers = await sdk.receipts.list(roomId);
      return markers.map(({ userId, seq }) => ({ userId, seq }));
    },
    enabled: sdk !== null,
  });
}

/**
 * Keeps the cached markers of this room current: a `receipt_updated` upserts the
 * marker (monotonic on `seq`), and a reconnection refetches them. Mounted by `RoomChat`.
 */
export function useReceiptsSync(roomId: string): void {
  const queryClient = useQueryClient();
  const key = chatKeys.receipts(roomId);

  useRoomEvents(({ roomId: eventRoomId, event }) => {
    if (eventRoomId !== roomId || event.type !== 'receipt_updated') return;
    queryClient.setQueryData<ReadMarker[]>(key, (current) =>
      current ? upsertMarker(current, event.content) : current,
    );
  });

  useReconnected(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  });
}

/**
 * `messageSeq -> userIds` of the other current members whose marker sits on that
 * message. Empty until the markers, the members and the caller are known. Members with
 * no name left (deleted accounts) are skipped.
 */
export function useReadersBySeq(
  roomId: string,
  messages: readonly TimelineMessage[] | undefined,
): ReadonlyMap<string, string[]> {
  const markers = useReceipts(roomId).data;
  const members = useRoomMembers(roomId).data?.members;
  const meId = useMe().data?.id;

  return useMemo(() => {
    if (!messages || !markers || !members || meId === undefined) return NO_READERS;
    const memberIds = new Set(
      members.filter((member) => member.user.displayName !== null).map((member) => member.user.id),
    );
    return readersBySeq(messages, markers, memberIds, meId);
  }, [messages, markers, members, meId]);
}

/** How many other current members could read a message: the audience of "read by everyone". */
export function useReceiptAudienceSize(roomId: string): number | undefined {
  const members = useRoomMembers(roomId).data?.members;
  const meId = useMe().data?.id;

  return useMemo(() => {
    if (!members || meId === undefined) return undefined;
    return members.filter((member) => member.user.displayName !== null && member.user.id !== meId)
      .length;
  }, [members, meId]);
}
