import type { EkozClient, Member } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** Members are loaded in pages of this size (the server maximum). */
export const MEMBERS_PAGE_LIMIT = 200;
/** Pages followed before the list is reported as truncated: 2,000 members. */
export const MAX_MEMBER_PAGES = 10;

export interface RoomMembers {
  members: Member[];
  /** True when the last page loaded still had a `nextCursor`. */
  truncated: boolean;
}

export const roomMembersKey = (roomId: string) => ['members', roomId] as const;

/** Members of a room, following `nextCursor` (`GET /rooms/:id/members`). */
export async function fetchRoomMembers(sdk: EkozClient, roomId: string): Promise<RoomMembers> {
  const members: Member[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_MEMBER_PAGES; page += 1) {
    const result = await sdk.rooms.members(roomId, {
      limit: MEMBERS_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    members.push(...result.items);
    if (result.nextCursor === null) return { members, truncated: false };
    cursor = result.nextCursor;
    truncated = true;
  }

  return { members, truncated };
}

/** The room members, shared by every feature that needs them (one request per room). */
export function useRoomMembers(roomId: string, enabled = true) {
  const sdk = useSdk();

  return useQuery<RoomMembers>({
    queryKey: roomMembersKey(roomId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return fetchRoomMembers(sdk, roomId);
    },
    enabled: enabled && sdk !== null,
  });
}
