import type { EkozClient, UserSummary } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `GET /users?ids=` accepts at most this many ids per call. */
export const SUMMARIES_CHUNK_SIZE = 100;

export const userSummariesKey = (sortedIds: readonly string[]) =>
  ['users', 'summaries', sortedIds] as const;

/** Summaries of `ids` (distinct), in chunks of {@link SUMMARIES_CHUNK_SIZE}. */
export async function fetchUserSummaries(
  sdk: EkozClient,
  ids: readonly string[],
): Promise<UserSummary[]> {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += SUMMARIES_CHUNK_SIZE) {
    chunks.push(ids.slice(start, start + SUMMARIES_CHUNK_SIZE));
  }

  return (await Promise.all(chunks.map((chunk) => sdk.users.summaries(chunk)))).flat();
}

/**
 * Public summaries of users by id, for people who are not in the members list
 * (they left the room). Idle while `ids` is empty; an unknown or deleted id comes
 * back with null fields.
 */
export function useUserSummaries(ids: readonly string[]) {
  const sdk = useSdk();
  const sortedIds = [...new Set(ids)].sort();

  return useQuery<UserSummary[]>({
    queryKey: userSummariesKey(sortedIds),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return fetchUserSummaries(sdk, sortedIds);
    },
    enabled: sdk !== null && sortedIds.length > 0,
  });
}
