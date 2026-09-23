/**
 * Rooms. Only the member listing lives here for now; `get` / `myPermissions`
 * arrive with `web-client-rooms` on this same resource.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { MembersPage } from '../types/wire.js';

export interface ListMembersParams {
  cursor?: string;
  limit?: number;
}

export interface RoomsResource {
  members(roomId: string, params?: ListMembersParams): Promise<MembersPage>;
}

export function createRoomsResource(session: SessionManager): RoomsResource {
  return {
    members(roomId, params = {}) {
      return session.request<MembersPage>('GET', `/rooms/${encodeURIComponent(roomId)}/members`, {
        query: { cursor: params.cursor, limit: params.limit },
      });
    },
  };
}
