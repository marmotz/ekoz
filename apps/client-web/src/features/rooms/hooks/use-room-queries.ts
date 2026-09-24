import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { roomQueries } from '@/features/rooms/api/queries';
import { useSdk } from '@/shared/sdk/use-sdk';

/** The caller's spaces and channels (`GET /rooms`). */
export function useRooms() {
  return useQuery(roomQueries.list(useSdk()));
}

/** The caller's pending room invitations. */
export function useInvitations() {
  return useQuery(roomQueries.invitations(useSdk()));
}

/** One room (`GET /rooms/:id`). */
export function useRoom(roomId: string) {
  return useQuery(roomQueries.detail(useSdk(), roomId));
}

/** Name, topic and own join request of a room the caller cannot read. */
export function useRoomPreview(roomId: string) {
  return useQuery(roomQueries.preview(useSdk(), roomId));
}

/** The caller's effective capabilities in a room. */
export function useMyPermissions(roomId: string) {
  return useQuery(roomQueries.permissions(useSdk(), roomId));
}

/** Public directory search, paged. */
export function useDirectory(query: string) {
  return useInfiniteQuery(roomQueries.directory(useSdk(), query));
}

/** Pending join requests of a room, paged. */
export function useJoinRequests(roomId: string) {
  return useInfiniteQuery(roomQueries.joinRequests(useSdk(), roomId));
}
