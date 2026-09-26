import type { PresenceStatus, Room } from '@ekozhq/sdk';

import { useRoomMembers } from '@/shared/members/room-members';
import { useUserPresence } from '@/shared/realtime/own-presence';
import { useMe } from '@/shared/sdk/use-me';

/**
 * The presence of the other participant of a direct conversation; `undefined` for any
 * other room type, or while the partner is not known yet. Members are read from the
 * shared members query, so a room listed twice (sidebar and header) costs one request.
 */
export function useDirectPresence(roomId: string, type: Room['type']): PresenceStatus | undefined {
  const isDirect = type === 'dm';
  const myId = useMe().data?.id;
  const members = useRoomMembers(roomId, isDirect);
  const partnerId = isDirect
    ? members.data?.members.find((member) => member.user.id !== myId)?.user.id
    : undefined;
  const presence = useUserPresence(partnerId);

  return partnerId ? presence : undefined;
}
