/**
 * The caller's room invitations (invitee side). Distinct from `client.invitations`,
 * the owner-only registration invitations (web-client-rooms technical design §3).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { Membership, MyRoomInvitationsListResponse } from '../types/wire.js';

export interface RoomInvitationsResource {
  /** Pending room invitations of the caller, newest first. */
  listMine(): Promise<MyRoomInvitationsListResponse>;
  accept(invitationId: string): Promise<Membership>;
  decline(invitationId: string): Promise<void>;
}

export function createRoomInvitationsResource(session: SessionManager): RoomInvitationsResource {
  const base = (invitationId: string) => `/invitations/${encodeURIComponent(invitationId)}`;

  return {
    listMine() {
      return session.request<MyRoomInvitationsListResponse>('GET', '/me/room-invitations');
    },

    accept(invitationId) {
      return session.request<Membership>('POST', `${base(invitationId)}/accept`);
    },

    decline(invitationId) {
      return session.request<void>('POST', `${base(invitationId)}/decline`);
    },
  };
}
