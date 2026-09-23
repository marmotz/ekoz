/**
 * Per-room catch-up (`GET /sync`).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { SyncResponse } from '../types/events.js';

export interface SyncParams {
  room: string;
  /** Return events strictly after this `seq` (defaults to `0` server-side). */
  since?: string;
  limit?: number;
}

export interface SyncResource {
  get(params: SyncParams): Promise<SyncResponse>;
}

export function createSyncResource(session: SessionManager): SyncResource {
  return {
    get(params) {
      return session.request<SyncResponse>('GET', '/sync', {
        query: { room: params.room, since: params.since, limit: params.limit },
      });
    },
  };
}
