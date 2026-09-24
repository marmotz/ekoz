import type { EkozClient } from '@ekozhq/sdk';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { roomKeys } from '@/features/rooms/api/keys';

/**
 * No live channel refreshes the rooms list and the invitations yet, so both are
 * refetched more eagerly than the global defaults (technical design 4.5).
 */
const FRESH = { staleTime: 10_000, refetchOnWindowFocus: true } as const;

function started(sdk: EkozClient | null): EkozClient {
  if (!sdk) throw new Error('SDK not started');
  return sdk;
}

/**
 * Query option factories over the SDK. Each takes the client from `useSdk()`, which
 * is `null` until the client has resumed: the query stays disabled until then.
 */
export const roomQueries = {
  /** `GET /rooms`: the caller's spaces and channels. */
  list: (sdk: EkozClient | null) =>
    queryOptions({
      queryKey: roomKeys.list(),
      queryFn: () => started(sdk).rooms.list(),
      enabled: sdk !== null,
      ...FRESH,
    }),

  /** `GET /me/room-invitations`: the caller's pending room invitations. */
  invitations: (sdk: EkozClient | null) =>
    queryOptions({
      queryKey: roomKeys.invitations(),
      queryFn: () => started(sdk).roomInvitations.listMine(),
      enabled: sdk !== null,
      ...FRESH,
    }),

  /** `GET /rooms/:id`. */
  detail: (sdk: EkozClient | null, roomId: string) =>
    queryOptions({
      queryKey: roomKeys.detail(roomId),
      queryFn: () => started(sdk).rooms.get(roomId),
      enabled: sdk !== null,
    }),

  /** `GET /rooms/:id/preview`. */
  preview: (sdk: EkozClient | null, roomId: string) =>
    queryOptions({
      queryKey: roomKeys.preview(roomId),
      queryFn: () => started(sdk).rooms.preview(roomId),
      enabled: sdk !== null,
    }),

  /** `GET /rooms/:id/my-permissions`. */
  permissions: (sdk: EkozClient | null, roomId: string) =>
    queryOptions({
      queryKey: roomKeys.permissions(roomId),
      queryFn: () => started(sdk).rooms.myPermissions(roomId),
      enabled: sdk !== null,
    }),

  /** `GET /directory`, paged on `nextCursor`. An empty query lists every public channel. */
  directory: (sdk: EkozClient | null, query: string) =>
    infiniteQueryOptions({
      queryKey: roomKeys.directory(query),
      queryFn: ({ pageParam }) =>
        started(sdk).directory.list({ query: query || undefined, cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: sdk !== null,
    }),

  /** `GET /rooms/:id/join-requests`, paged on `nextCursor`. */
  joinRequests: (sdk: EkozClient | null, roomId: string) =>
    infiniteQueryOptions({
      queryKey: roomKeys.joinRequests(roomId),
      queryFn: ({ pageParam }) =>
        started(sdk).rooms.listJoinRequests(roomId, { cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: sdk !== null,
    }),
};
