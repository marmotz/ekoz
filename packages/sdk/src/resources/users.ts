/**
 * Public profile lookups by `name/server` identifier (technical.md §10).
 * Requires authentication server-side, even though the profile itself is public.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { PublicProfileView } from '../types/wire.js';

export interface UsersResource {
  getProfile(identifier: string): Promise<PublicProfileView>;
}

export function createUsersResource(session: SessionManager): UsersResource {
  return {
    getProfile(identifier) {
      return session.request<PublicProfileView>('GET', `/users/${encodeURIComponent(identifier)}`);
    },
  };
}
