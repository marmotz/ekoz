import type { EkozClient } from '@ekozhq/sdk';
import { queryOptions } from '@tanstack/react-query';

import { conversationKeys } from '@/features/direct-messages/api/keys';

function started(sdk: EkozClient | null): EkozClient {
  if (!sdk) throw new Error('SDK not started');
  return sdk;
}

/**
 * Query option factories over the SDK. Each takes the client from `useSdk()`, which
 * is `null` until the client has resumed: the query stays disabled until then.
 */
export const conversationQueries = {
  /** `GET /me/conversations`. */
  list: (sdk: EkozClient | null) =>
    queryOptions({
      queryKey: conversationKeys.list(),
      queryFn: () => started(sdk).conversations.list(),
      enabled: sdk !== null,
    }),

  /** `GET /rooms/:id`. */
  room: (sdk: EkozClient | null, roomId: string) =>
    queryOptions({
      queryKey: conversationKeys.room(roomId),
      queryFn: () => started(sdk).rooms.get(roomId),
      enabled: sdk !== null,
      retry: false,
    }),

  /** `GET /rooms/:id/my-permissions`. */
  permissions: (sdk: EkozClient | null, roomId: string) =>
    queryOptions({
      queryKey: conversationKeys.permissions(roomId),
      queryFn: () => started(sdk).rooms.myPermissions(roomId),
      enabled: sdk !== null,
    }),

  /** `GET /me/contacts?query=`. */
  contacts: (sdk: EkozClient | null, query: string) =>
    queryOptions({
      queryKey: conversationKeys.contacts(query),
      queryFn: () => started(sdk).conversations.searchContacts(query),
      enabled: sdk !== null,
    }),

  /** `GET /users/:identifier`, for an exact `name/server` lookup. */
  profile: (sdk: EkozClient | null, identifier: string) =>
    queryOptions({
      queryKey: conversationKeys.profile(identifier),
      queryFn: () => started(sdk).users.getProfile(identifier),
      enabled: sdk !== null,
      retry: false,
    }),
};
