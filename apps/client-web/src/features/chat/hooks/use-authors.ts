import type { Member } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { fetchMembers } from '@/features/chat/api/queries';
import { chatKeys } from '@/features/chat/api/query-keys';
import { useSdk } from '@/shared/sdk/use-sdk';

export type AuthorKind = 'user' | 'deleted' | 'unknown';

export interface Author {
  kind: AuthorKind;
  /** `name/server`, or null when there is nothing to key an avatar by. */
  identifier: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

const DELETED: Author = { kind: 'deleted', identifier: null, displayName: null, avatarUrl: null };
const UNKNOWN: Author = { kind: 'unknown', identifier: null, displayName: null, avatarUrl: null };

/**
 * Resolves message authors from the room members (`['chat','members',roomId]`).
 * A null author or a member whose `displayName` is null is a deleted account; an
 * author missing from the list (they left the room) is unknown and triggers one
 * members refetch. Display labels are chosen by the caller from `kind`.
 */
export function useAuthors(roomId: string, authorIds: readonly (string | null)[]) {
  const sdk = useSdk();
  const members = useQuery<Member[]>({
    queryKey: chatKeys.members(roomId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return fetchMembers(sdk, roomId);
    },
    enabled: sdk !== null,
  });

  const byId = useMemo(() => {
    const map = new Map<string, Member['user']>();
    for (const member of members.data ?? []) map.set(member.user.id, member.user);
    return map;
  }, [members.data]);

  const refetched = useRef(false);
  const { refetch } = members;
  const loaded = members.data !== undefined;
  const hasUnknown = authorIds.some((id) => id !== null && !byId.has(id));
  useEffect(() => {
    if (loaded && hasUnknown && !refetched.current) {
      refetched.current = true;
      void refetch();
    }
  }, [loaded, hasUnknown, refetch]);

  const resolve = useCallback(
    (authorId: string | null): Author => {
      if (authorId === null) return DELETED;
      const user = byId.get(authorId);
      if (!user) return UNKNOWN;
      if (user.displayName === null) return DELETED;
      return {
        kind: 'user',
        identifier: user.identifier,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      };
    },
    [byId],
  );

  return { resolve, isLoading: members.isPending };
}
