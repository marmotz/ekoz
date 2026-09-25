/**
 * The caller's mentions: unread counters per room and the "My mentions" list
 * (web-client-mentions technical design §4).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { MyMentionsPage, UnreadMentionsResponse } from '../types/wire.js';

export interface ListMentionsParams {
  cursor?: string;
  limit?: number;
}

export interface MentionsResource {
  /** Messages that concern the caller, most recent mention first. */
  list(params?: ListMentionsParams): Promise<MyMentionsPage>;
  /** Unread mention counters per room, direct and collective. */
  unread(): Promise<UnreadMentionsResponse>;
}

export function createMentionsResource(session: SessionManager): MentionsResource {
  return {
    list(params = {}) {
      return session.request<MyMentionsPage>('GET', '/me/mentions', {
        query: { cursor: params.cursor, limit: params.limit },
      });
    },

    unread() {
      return session.request<UnreadMentionsResponse>('GET', '/me/mentions/unread');
    },
  };
}
