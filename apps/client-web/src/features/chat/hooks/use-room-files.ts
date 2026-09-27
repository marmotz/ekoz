import { useInfiniteQuery } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat/api/query-keys';
import { useSdk } from '@/shared/sdk/use-sdk';

/** Room files are loaded in pages of this size. */
export const ROOM_FILES_PAGE_SIZE = 30;

/** A room's attachments, newest first, following `nextCursor` (`GET /rooms/:id/files`). */
export function useRoomFiles(roomId: string, kind: 'media' | 'documents', enabled: boolean) {
  const sdk = useSdk();

  return useInfiniteQuery({
    queryKey: chatKeys.files(roomId, kind),
    queryFn: ({ pageParam }) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.files.roomFiles(roomId, {
        kind,
        limit: ROOM_FILES_PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      });
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && sdk !== null,
  });
}
