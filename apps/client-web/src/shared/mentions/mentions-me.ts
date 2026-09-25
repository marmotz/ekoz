import type { GroupListResponse, MentionTarget } from '@ekozhq/sdk';
import type { QueryClient } from '@tanstack/react-query';

import { roomGroupsKey } from '@/shared/groups/room-groups';
import { type RoomMembers, roomMembersKey } from '@/shared/members/room-members';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';

/** How a message concerns the viewer: named directly, or through a collective target. */
export type MentionsMe = 'direct' | 'collective';

/**
 * What the client knows about the viewer in a room. `role` and `groupIds` are
 * `undefined` while the members / groups are not loaded.
 */
export interface MentionViewer {
  userId: string;
  /** The viewer's effective role in the room. */
  role?: string | undefined;
  /** Ids of the groups the viewer belongs to. */
  groupIds?: ReadonlySet<string> | undefined;
}

export interface DeriveOptions {
  /**
   * What an unresolved `role` / `group` target counts as: `ignore` (the default)
   * says it does not concern the viewer, `match` says it may.
   */
  unresolved?: 'ignore' | 'match';
}

/** Server value of `Message.mentionsMe` (a free string on the wire) as the union the client uses. */
export function parseMentionsMe(value: string | null | undefined): MentionsMe | null {
  return value === 'direct' || value === 'collective' ? value : null;
}

/**
 * Derives "concerns me" for a live `message_created` (web-client-mentions technical
 * design C3): the event carries no per-viewer value. Receiving it means the viewer is
 * an effective member now, which is send time. The author never concerns themselves.
 */
export function deriveMentionsMe(
  mentions: readonly MentionTarget[],
  authorId: string | null,
  viewer: MentionViewer | null,
  { unresolved = 'ignore' }: DeriveOptions = {},
): MentionsMe | null {
  if (!viewer || authorId === viewer.userId) return null;

  let result: MentionsMe | null = null;
  for (const mention of mentions) {
    switch (mention.type) {
      case 'user':
        if (mention.target === viewer.userId) return 'direct';
        break;
      case 'all':
        result = 'collective';
        break;
      case 'role':
        if (viewer.role === undefined ? unresolved === 'match' : mention.target === viewer.role) {
          result = 'collective';
        }
        break;
      case 'group': {
        const groups = viewer.groupIds;
        if (groups === undefined ? unresolved === 'match' : groups.has(mention.target ?? '')) {
          result = 'collective';
        }
        break;
      }
    }
  }
  return result;
}

/**
 * The viewer as the query cache knows them for `roomId`; `null` until `GET /me` has
 * answered. Read at event time, so a live handler never works from a stale closure.
 */
export function viewerFromCache(queryClient: QueryClient, roomId: string): MentionViewer | null {
  const me = queryClient.getQueryData<{ id: string }>(ME_QUERY_KEY);
  if (!me) return null;

  const members = queryClient.getQueryData<RoomMembers>(roomMembersKey(roomId));
  const groups = queryClient.getQueryData<GroupListResponse>(roomGroupsKey(roomId));
  return {
    userId: me.id,
    role: members?.members.find((member) => member.user.id === me.id)?.role,
    groupIds: groups
      ? new Set(groups.items.filter((group) => group.isMember).map((group) => group.id))
      : undefined,
  };
}
