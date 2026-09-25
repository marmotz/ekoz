import type { EkozClient, GroupListResponse } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** Groups change rarely; a stale list is refetched when a consumer mounts or asks. */
export const GROUPS_STALE_TIME = 30_000;

export const roomGroupsKey = (roomId: string) => ['groups', roomId] as const;

export function fetchRoomGroups(sdk: EkozClient, roomId: string): Promise<GroupListResponse> {
  return sdk.groups.list(roomId);
}

/** Groups defined on the room and on its ancestors (`GET /rooms/:id/groups`), shared by every consumer. */
export function useRoomGroups(roomId: string) {
  const sdk = useSdk();

  return useQuery<GroupListResponse>({
    queryKey: roomGroupsKey(roomId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return fetchRoomGroups(sdk, roomId);
    },
    enabled: sdk !== null,
    staleTime: GROUPS_STALE_TIME,
  });
}
