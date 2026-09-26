/**
 * Read markers: "read up to seq" per (room, user)
 * (web-client-read-state technical design section 3).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ReadMarker } from '../types/wire.js';

export interface ReceiptsResource {
  /** Set the caller's marker. Monotonic: a lower `seq` is ignored and the current marker returned. */
  set(roomId: string, seq: string): Promise<ReadMarker>;
  /** One marker per user who has one, including users who since left the room. */
  list(roomId: string): Promise<ReadMarker[]>;
}

export function createReceiptsResource(session: SessionManager): ReceiptsResource {
  return {
    set(roomId, seq) {
      return session.request<ReadMarker>('PUT', `/rooms/${encodeURIComponent(roomId)}/receipt`, {
        body: { seq },
      });
    },

    list(roomId) {
      return session.request<ReadMarker[]>('GET', `/rooms/${encodeURIComponent(roomId)}/receipts`);
    },
  };
}
