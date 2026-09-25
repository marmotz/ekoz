import type { CreateGroupBody, EkozClient } from '@ekozhq/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { roomGroupsKey } from '@/shared/groups/room-groups';
import { useSdk } from '@/shared/sdk/use-sdk';

function useStartedSdk(): () => EkozClient {
  const sdk = useSdk();

  return () => {
    if (!sdk) throw new Error('SDK not started');
    return sdk;
  };
}

/** The members of one group (`GET /rooms/:id/groups/:groupId`); under the groups key, so every write refreshes it. */
export function useGroupDetail(roomId: string, groupId: string, { enabled = true } = {}) {
  const sdk = useSdk();

  return useQuery({
    queryKey: [...roomGroupsKey(roomId), 'detail', groupId] as const,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.groups.get(roomId, groupId);
    },
    enabled: enabled && sdk !== null,
  });
}

/** Every write refreshes the groups of the room, failed or not: a stale list is the usual cause of a conflict. */
function useGroupMutation<Variables, Result>(
  roomId: string,
  run: (sdk: EkozClient, variables: Variables) => Promise<Result>,
) {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Variables) => run(sdk(), variables),
    onSettled: () => queryClient.invalidateQueries({ queryKey: roomGroupsKey(roomId) }),
  });
}

export function useCreateGroup(roomId: string) {
  return useGroupMutation(roomId, (sdk, body: CreateGroupBody) => sdk.groups.create(roomId, body));
}

export function useRenameGroup(roomId: string) {
  return useGroupMutation(roomId, (sdk, { groupId, name }: { groupId: string; name: string }) =>
    sdk.groups.rename(roomId, groupId, name),
  );
}

export function useDeleteGroup(roomId: string) {
  return useGroupMutation(roomId, (sdk, groupId: string) => sdk.groups.remove(roomId, groupId));
}

export function useAddGroupMember(roomId: string) {
  return useGroupMutation(roomId, (sdk, { groupId, userId }: { groupId: string; userId: string }) =>
    sdk.groups.addMember(roomId, groupId, userId),
  );
}

export function useRemoveGroupMember(roomId: string) {
  return useGroupMutation(roomId, (sdk, { groupId, userId }: { groupId: string; userId: string }) =>
    sdk.groups.removeMember(roomId, groupId, userId),
  );
}
