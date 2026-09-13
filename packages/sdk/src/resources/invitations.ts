/**
 * Owner-only registration invitations (technical.md §10).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  CreatedInvitation,
  CreateInvitationBody,
  InvitationsListResponse,
} from '../types/wire.js';

export interface InvitationsResource {
  create(body: CreateInvitationBody): Promise<CreatedInvitation>;
  list(): Promise<InvitationsListResponse>;
  revoke(id: string): Promise<void>;
}

export function createInvitationsResource(session: SessionManager): InvitationsResource {
  return {
    create(body) {
      return session.request<CreatedInvitation>('POST', '/invitations', { body });
    },

    list() {
      return session.request<InvitationsListResponse>('GET', '/invitations');
    },

    revoke(id) {
      return session.request<void>('DELETE', `/invitations/${encodeURIComponent(id)}`);
    },
  };
}
