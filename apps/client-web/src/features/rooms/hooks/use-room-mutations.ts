import type { CreateChannelBody, CreateSpaceBody, EkozClient } from '@ekozhq/sdk';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

import { hasRoomErrorCode } from '@/features/rooms/api/errors';
import { roomKeys } from '@/features/rooms/api/keys';
import { useSdk } from '@/shared/sdk/use-sdk';

/** The SDK client for a mutation (mutations only run in the browser, once it has started). */
function useStartedSdk(): () => EkozClient {
  const sdk = useSdk();

  return () => {
    if (!sdk) throw new Error('SDK not started');
    return sdk;
  };
}

function useInvalidate() {
  const queryClient = useQueryClient();

  return (...keys: QueryKey[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** `POST /spaces`. */
export function useCreateSpace() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: CreateSpaceBody) => sdk().rooms.createSpace(body),
    onSuccess: () => invalidate(roomKeys.list()),
  });
}

/** `POST /rooms`: a channel under a space. */
export function useCreateChannel() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: CreateChannelBody) => sdk().rooms.createChannel(body),
    onSuccess: () => invalidate(roomKeys.list()),
  });
}

/** `POST /rooms/:id/join`. `room.already_member` means the list is stale: it is refreshed too. */
export function useJoinRoom() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (roomId: string) => sdk().rooms.join(roomId),
    onSuccess: (_membership, roomId) => invalidate(roomKeys.list(), roomKeys.permissions(roomId)),
    onError: (error, roomId) => {
      if (hasRoomErrorCode(error, 'room.already_member')) {
        return invalidate(roomKeys.list(), roomKeys.permissions(roomId));
      }
    },
  });
}

/** `POST /rooms/:id/leave`. */
export function useLeaveRoom() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (roomId: string) => sdk().rooms.leave(roomId),
    onSuccess: (_result, roomId) => invalidate(roomKeys.list(), roomKeys.permissions(roomId)),
  });
}

/** `POST /rooms/:id/join-request`: the preview carries the caller's request state. */
export function useRequestToJoin() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (roomId: string) => sdk().rooms.requestToJoin(roomId),
    onSettled: (_request, _error, roomId) => invalidate(roomKeys.preview(roomId)),
  });
}

export interface InvitationVariables {
  invitationId: string;
  roomId: string;
}

/**
 * `POST /invitations/:id/accept`. The invitations are refreshed even on failure: an
 * invitation resolved elsewhere must leave the list.
 */
export function useAcceptInvitation() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ invitationId }: InvitationVariables) =>
      sdk().roomInvitations.accept(invitationId),
    onSettled: (_membership, _error, { roomId }) =>
      invalidate(roomKeys.list(), roomKeys.invitations(), roomKeys.permissions(roomId)),
  });
}

/**
 * `POST /invitations/:id/decline`. The room itself is refreshed too: a pending
 * invitation was what let the caller read an invite-only room.
 */
export function useDeclineInvitation() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ invitationId }: InvitationVariables) =>
      sdk().roomInvitations.decline(invitationId),
    onSettled: (_result, _error, { roomId }) =>
      invalidate(
        roomKeys.list(),
        roomKeys.invitations(),
        roomKeys.permissions(roomId),
        roomKeys.detail(roomId),
      ),
  });
}

export interface JoinRequestVariables {
  roomId: string;
  requestId: string;
}

/**
 * `POST /rooms/:id/join-requests/:requestId/approve`. The pending requests are
 * refreshed even on failure (a `409` means the request was resolved elsewhere); an
 * approval adds a member, so the rooms list is refreshed as well.
 */
export function useApproveJoinRequest() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ roomId, requestId }: JoinRequestVariables) =>
      sdk().rooms.approveJoinRequest(roomId, requestId),
    onSettled: (_membership, _error, { roomId }) =>
      invalidate(roomKeys.joinRequests(roomId), roomKeys.list()),
  });
}

/** `POST /rooms/:id/join-requests/:requestId/reject`. */
export function useRejectJoinRequest() {
  const sdk = useStartedSdk();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ roomId, requestId }: JoinRequestVariables) =>
      sdk().rooms.rejectJoinRequest(roomId, requestId),
    onSettled: (_result, _error, { roomId }) => invalidate(roomKeys.joinRequests(roomId)),
  });
}
