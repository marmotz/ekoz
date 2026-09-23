import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { fetchFirstPage, fetchOlderPage } from '@/features/chat/api/queries';
import { chatKeys } from '@/features/chat/api/query-keys';
import { prependOlder, type Timeline } from '@/features/chat/lib/timeline';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The room timeline: one cache entry per room, seeded by the newest page and then
 * updated in place by the live sync, the composer and `useLoadOlder`. It is never
 * refetched on its own (that would drop live state); `RoomChat` removes it on unmount.
 */
export function useTimeline(roomId: string) {
  const sdk = useSdk();

  return useQuery<Timeline>({
    queryKey: chatKeys.timeline(roomId),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return fetchFirstPage(sdk, roomId);
    },
    enabled: sdk !== null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Loads the page before the oldest loaded message; one request at a time. */
export function useLoadOlder(roomId: string) {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const loadOlder = useCallback(async () => {
    const timeline = queryClient.getQueryData<Timeline>(chatKeys.timeline(roomId));
    const oldest = timeline?.messages[0];
    if (!sdk || !timeline || !oldest || !timeline.hasMoreOlder || inFlight.current) return;

    inFlight.current = true;
    setState('loading');
    try {
      const page = await fetchOlderPage(sdk, roomId, oldest.seq);
      queryClient.setQueryData<Timeline>(chatKeys.timeline(roomId), (current) =>
        current ? prependOlder(current, page) : current,
      );
      setState('idle');
    } catch {
      setState('error');
    } finally {
      inFlight.current = false;
    }
  }, [sdk, queryClient, roomId]);

  return { loadOlder, state };
}
