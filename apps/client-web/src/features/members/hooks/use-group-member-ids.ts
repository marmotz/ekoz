import { useQueries } from '@tanstack/react-query';

import type { GroupMemberIds } from '@/features/members/lib/group-members';
import { roomGroupsKey, useRoomGroups } from '@/shared/groups/room-groups';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The groups of a room (own and inherited) with their member ids, for the `group`
 * view. Each group's members are one request, under the same key as the group
 * management page so both share the cache; nothing is fetched unless `enabled`.
 */
export function useGroupMemberIds(roomId: string, enabled: boolean) {
  const sdk = useSdk();
  const groups = useRoomGroups(roomId);
  const items = groups.data?.items ?? [];

  const details = useQueries({
    queries: items.map((group) => ({
      queryKey: [...roomGroupsKey(roomId), 'detail', group.id] as const,
      queryFn: () => {
        if (!sdk) throw new Error('SDK not started');
        return sdk.groups.get(roomId, group.id);
      },
      enabled: enabled && sdk !== null,
    })),
  });

  const data: GroupMemberIds[] = items.flatMap((group, index) => {
    const detail = details[index]?.data;
    return detail
      ? [{ id: group.id, name: group.name, memberIds: detail.members.map((user) => user.id) }]
      : [];
  });

  return {
    data,
    isPending: enabled && (groups.isPending || details.some((query) => query.isPending)),
  };
}
