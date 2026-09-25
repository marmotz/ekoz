import type { Member, UserSummary } from '@ekozhq/sdk';
import { useCallback, useMemo } from 'react';

import { useRoomMembers } from '@/shared/members/room-members';
import { useUserSummaries } from '@/shared/members/use-user-summaries';

/**
 * - `member`: in the members list.
 * - `left`: no longer a member, but the account still has a name.
 * - `deleted`: no author, or an account with no name left.
 * - `pending`: the lookup is still loading.
 */
export type AuthorKind = 'member' | 'left' | 'deleted' | 'pending';

export interface Author {
  kind: AuthorKind;
  /** The account id; null for a message with no author. */
  userId: string | null;
  /** `name/server`, or null when there is nothing to key an avatar by. */
  identifier: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** The room role; null for `left`, `deleted` and `pending` authors. */
  role: Member['role'] | null;
}

const empty = (kind: AuthorKind, userId: string | null): Author => ({
  kind,
  userId,
  identifier: null,
  displayName: null,
  avatarUrl: null,
  role: null,
});

/**
 * Resolves message authors from the shared members list first, then, for the
 * authors missing from it (they left the room), from `GET /users?ids=`. Display
 * labels are chosen by the caller from `kind`. A failed summary lookup leaves the
 * author `deleted`, since no name could be found for them.
 */
export function useAuthors(roomId: string, authorIds: readonly (string | null)[]) {
  const members = useRoomMembers(roomId);

  const byId = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members.data?.members ?? []) map.set(member.user.id, member);
    return map;
  }, [members.data]);

  const missingIds = useMemo(() => {
    if (members.isPending) return [];
    const ids = new Set<string>();
    for (const id of authorIds) if (id !== null && !byId.has(id)) ids.add(id);
    return [...ids];
  }, [members.isPending, authorIds, byId]);

  const summaries = useUserSummaries(missingIds);

  const summaryById = useMemo(() => {
    const map = new Map<string, UserSummary>();
    for (const summary of summaries.data ?? []) map.set(summary.id, summary);
    return map;
  }, [summaries.data]);

  const resolve = useCallback(
    (authorId: string | null): Author => {
      if (authorId === null) return empty('deleted', null);
      if (members.isPending) return empty('pending', authorId);

      const member = byId.get(authorId);
      if (member) {
        const { user } = member;
        if (user.displayName === null) return empty('deleted', authorId);
        return {
          kind: 'member',
          userId: authorId,
          identifier: user.identifier,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: member.role,
        };
      }

      const summary = summaryById.get(authorId);
      if (!summary)
        return summaries.isError ? empty('deleted', authorId) : empty('pending', authorId);
      if (summary.displayName === null) return empty('deleted', authorId);
      return {
        kind: 'left',
        userId: authorId,
        identifier: summary.identifier,
        displayName: summary.displayName,
        avatarUrl: summary.avatarUrl,
        role: null,
      };
    },
    [members.isPending, byId, summaryById, summaries.isError],
  );

  return { resolve, isLoading: members.isPending };
}
