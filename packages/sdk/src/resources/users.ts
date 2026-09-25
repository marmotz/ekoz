/**
 * Public profile lookups by `name/server` identifier (technical.md §10).
 * Requires authentication server-side, even though the profile itself is public.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { RequestOptions } from '../transport/http-client.js';
import type { PublicProfileView, UserSummary, UserSummaryList } from '../types/wire.js';

export interface AvatarOptions {
  /** Cache-busting version, taken from the `v` query of `avatarUrl`. */
  version?: string | number;
  signal?: AbortSignal;
}

export interface UsersResource {
  getProfile(identifier: string): Promise<PublicProfileView>;
  /**
   * Summaries of users by id, in request order; an unknown or deleted id comes back
   * with null `identifier`, `displayName` and `avatarUrl`. Does not split: pass at
   * most 100 ids.
   */
  summaries(ids: readonly string[]): Promise<UserSummary[]>;
  /** Fetch the avatar image; the route needs a Bearer token so `<img src>` cannot load it. */
  avatar(identifier: string, options?: AvatarOptions): Promise<Blob>;
}

export function createUsersResource(session: SessionManager): UsersResource {
  return {
    getProfile(identifier) {
      return session.request<PublicProfileView>('GET', `/users/${encodeURIComponent(identifier)}`);
    },

    async summaries(ids) {
      const list = await session.request<UserSummaryList>('GET', '/users', {
        query: { ids: ids.join(',') },
      });
      return list.items;
    },

    avatar(identifier, options = {}) {
      const request: RequestOptions = { responseType: 'blob' };
      if (options.version !== undefined) request.query = { v: options.version };
      if (options.signal) request.signal = options.signal;
      return session.request<Blob>(
        'GET',
        `/users/${encodeURIComponent(identifier)}/avatar`,
        request,
      );
    },
  };
}
