/**
 * The calling account's own session management (technical.md §10).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  RevokeAllSessionsResponse,
  SessionsListResponse,
  SessionView,
} from '../types/wire.js';

export interface SessionsResource {
  list(): Promise<SessionsListResponse>;
  rename(id: string, body: { deviceName: string }): Promise<SessionView>;
  revoke(id: string): Promise<void>;
  revokeAllOthers(): Promise<RevokeAllSessionsResponse>;
}

export function createSessionsResource(session: SessionManager): SessionsResource {
  return {
    list() {
      return session.request<SessionsListResponse>('GET', '/sessions');
    },

    rename(id, body) {
      return session.request<SessionView>('PATCH', `/sessions/${encodeURIComponent(id)}`, {
        body,
      });
    },

    revoke(id) {
      return session.request<void>('DELETE', `/sessions/${encodeURIComponent(id)}`);
    },

    revokeAllOthers() {
      return session.request<RevokeAllSessionsResponse>('DELETE', '/sessions', {
        query: { all: true },
      });
    },
  };
}
