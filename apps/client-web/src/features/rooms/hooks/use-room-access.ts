import {
  EkozError,
  type MyRoomInvitation,
  type Room,
  type RoomListItem,
  type RoomPreview,
} from '@ekozhq/sdk';

import {
  useInvitations,
  useMyPermissions,
  useRoom,
  useRoomPreview,
  useRooms,
} from '@/features/rooms/hooks/use-room-queries';

/** The access states in which the room content is readable (technical design 4.6). */
export type RoomMembership = 'member' | 'invited' | 'joinable';

export type RoomAccessState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: RoomMembership;
      room: Room | RoomListItem;
      capabilities: readonly string[];
      /** The pending invitation, in the `invited` state only. */
      invitation: MyRoomInvitation | null;
    }
  | { status: 'request'; preview: RoomPreview }
  | { status: 'unavailable' };

function httpStatus(error: unknown): number | undefined {
  return error instanceof EkozError ? error.status : undefined;
}

/**
 * Resolves the caller's access to a room, from the cached rooms list first, then
 * `GET /rooms/:id`, then `GET /rooms/:id/preview` (technical design 4.6). Each step
 * is only fetched when the previous one did not decide.
 */
export function useRoomAccess(roomId: string): RoomAccessState {
  const rooms = useRooms();
  const invitations = useInvitations();

  const listed = rooms.data?.items.find(
    (item) => item.id === roomId && (item.access === 'member' || item.access === 'inherited'),
  );
  const invitation = invitations.data?.items.find((item) => item.room.id === roomId) ?? null;
  const listsReady = rooms.isSuccess && invitations.isSuccess;

  const detail = useRoom(roomId, { enabled: listsReady && !listed });
  const detailStatus = httpStatus(detail.error);
  const preview = useRoomPreview(roomId, { enabled: detailStatus === 403 });

  let readable: { room: Room | RoomListItem; status: RoomMembership } | null = null;
  if (listed) {
    readable = { room: listed, status: 'member' };
  } else if (detail.data && invitation) {
    readable = { room: detail.data, status: 'invited' };
  } else if (detail.data?.visibility === 'public') {
    readable = { room: detail.data, status: 'joinable' };
  }

  const permissions = useMyPermissions(roomId, { enabled: readable !== null });

  if (rooms.isError || invitations.isError) {
    return {
      status: 'error',
      retry: () => {
        void rooms.refetch();
        void invitations.refetch();
      },
    };
  }
  if (!listsReady) return { status: 'loading' };

  if (readable) {
    if (permissions.isPending) return { status: 'loading' };
    return {
      status: readable.status,
      room: readable.room,
      // Without capabilities the content stays readable; the server still enforces every action.
      capabilities: permissions.data?.capabilities ?? [],
      invitation: readable.status === 'invited' ? invitation : null,
    };
  }

  if (detail.isPending) return { status: 'loading' };
  // Readable but neither public nor backed by a known invitation: the cached lists are
  // stale; a refetch on focus or on a live event resolves it. Shown as not accessible.
  if (detail.isSuccess || detailStatus === 404) return { status: 'unavailable' };
  if (detailStatus !== 403) return { status: 'error', retry: () => void detail.refetch() };

  if (preview.isPending) return { status: 'loading' };
  if (preview.isSuccess) return { status: 'request', preview: preview.data };
  if (httpStatus(preview.error) === 404) return { status: 'unavailable' };
  return { status: 'error', retry: () => void preview.refetch() };
}
