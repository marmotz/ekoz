import type {
  AddConversationMembersBody,
  CreateGroupConversationBody,
  EkozClient,
  Room,
} from '@ekozhq/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { conversationKeys } from '@/features/direct-messages/api/keys';
import { useSdk } from '@/shared/sdk/use-sdk';

/** The SDK client for a mutation (mutations only run in the browser, once it has started). */
function useStartedSdk(): () => EkozClient {
  const sdk = useSdk();

  return () => {
    if (!sdk) throw new Error('SDK not started');
    return sdk;
  };
}

/** Refreshes the conversations list: every mutation of this feature changes what it returns. */
function useRefreshList() {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
}

/** `POST /dms`: get or create the one-to-one conversation with a user. */
export function useCreateDm() {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (userId: string): Promise<Room> => sdk().conversations.createDm(userId),
    onSuccess: () => refresh(),
  });
}

/** `POST /group-dms`. */
export function useCreateGroup() {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (body: CreateGroupConversationBody): Promise<Room> =>
      sdk().conversations.createGroup(body),
    onSuccess: () => refresh(),
  });
}

/** `PATCH /group-dms/:id`; `null` clears the name. */
export function useRenameGroup(roomId: string) {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (name: string | null) => sdk().conversations.rename(roomId, name),
    onSuccess: () => refresh(),
  });
}

/** `POST /group-dms/:id/members`. */
export function useAddGroupMembers(roomId: string) {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (body: AddConversationMembersBody) => sdk().conversations.addMembers(roomId, body),
    onSuccess: () => refresh(),
  });
}

/** `DELETE /group-dms/:id/members/:userId`. */
export function useRemoveGroupMember(roomId: string) {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (userId: string) => sdk().conversations.removeMember(roomId, userId),
    onSuccess: () => refresh(),
  });
}

/** `PUT` (promote) or `DELETE` (demote) `/group-dms/:id/admins/:userId`. */
export function useSetGroupAdmin(roomId: string) {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: ({ userId, admin }: { userId: string; admin: boolean }) =>
      admin
        ? sdk().conversations.grantAdmin(roomId, userId)
        : sdk().conversations.revokeAdmin(roomId, userId),
    onSuccess: () => refresh(),
  });
}

/**
 * `POST /rooms/:id/leave`: leaves a group, or deletes a one-to-one conversation for the
 * caller (it comes back with the next message, without its past).
 */
export function useLeaveConversation() {
  const sdk = useStartedSdk();
  const refresh = useRefreshList();

  return useMutation({
    mutationFn: (roomId: string) => sdk().rooms.leave(roomId),
    onSuccess: () => refresh(),
  });
}
