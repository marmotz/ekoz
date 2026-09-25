import { useInfiniteQuery } from '@tanstack/react-query';

import { myMentionsKey } from '@/shared/mentions/unread-mentions';
import { useSdk } from '@/shared/sdk/use-sdk';

/** Mentions are loaded in pages of this size. */
export const MY_MENTIONS_PAGE_SIZE = 30;

/** The messages that concern the caller, newest first, following `nextCursor` (`GET /me/mentions`). */
export function useMyMentions() {
  const sdk = useSdk();

  return useInfiniteQuery({
    queryKey: myMentionsKey,
    queryFn: ({ pageParam }) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.mentions.list({
        limit: MY_MENTIONS_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: sdk !== null,
  });
}
