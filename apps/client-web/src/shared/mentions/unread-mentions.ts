import type { UnreadMentionsResponse } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

export const unreadMentionsKey = ['mentions', 'unread'] as const;
/** Prefix of every "My mentions" page query (`features/mentions`). */
export const myMentionsKey = ['mentions', 'list'] as const;

export interface RoomUnreadMentions {
  direct: number;
  collective: number;
}

/** Unread mention counters per room (`GET /me/mentions/unread`). */
export function useUnreadMentions() {
  const sdk = useSdk();

  return useQuery<UnreadMentionsResponse>({
    queryKey: unreadMentionsKey,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.mentions.unread();
    },
    enabled: sdk !== null,
  });
}

export function unreadOfRoom(
  data: UnreadMentionsResponse | undefined,
  roomId: string,
): RoomUnreadMentions {
  const entry = data?.items.find((item) => item.roomId === roomId);
  return { direct: entry?.direct ?? 0, collective: entry?.collective ?? 0 };
}

/** Unread mentions of one room: `direct` are aimed at the caller, `collective` are `@all`, roles and groups. */
export function useRoomUnreadMentions(roomId: string): RoomUnreadMentions {
  return unreadOfRoom(useUnreadMentions().data, roomId);
}

/** Every unread mention, over every room. */
export function totalUnreadMentions(data: UnreadMentionsResponse | undefined): number {
  return (data?.items ?? []).reduce((sum, item) => sum + item.direct + item.collective, 0);
}
