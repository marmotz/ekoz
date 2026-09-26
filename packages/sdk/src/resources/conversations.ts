/**
 * Direct and group conversations: the caller's list, creation, group
 * management and contact search (web-client-direct-messages technical design §3).
 * Leaving a group or deleting a one-to-one conversation is `rooms.leave`.
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  AddConversationMembersBody,
  ContactsResponse,
  ConversationListResponse,
  CreateGroupConversationBody,
  Membership,
  Room,
} from '../types/wire.js';

export interface ConversationsResource {
  /** The caller's direct and group conversations, newest activity first. */
  list(): Promise<ConversationListResponse>;
  /** Get or create the one-to-one conversation with a user. */
  createDm(userId: string): Promise<Room>;
  createGroup(body: CreateGroupConversationBody): Promise<Room>;
  /** Rename a group; `null` clears its name. Group admin only. */
  rename(roomId: string, name: string | null): Promise<Room>;
  /** Add members to a group; `history: 'none'` hides its past messages from them. */
  addMembers(roomId: string, body: AddConversationMembersBody): Promise<Membership[]>;
  removeMember(roomId: string, userId: string): Promise<void>;
  grantAdmin(roomId: string, userId: string): Promise<void>;
  /** Revoking the last admin deletes the group for everyone. */
  revokeAdmin(roomId: string, userId: string): Promise<void>;
  /** Users sharing a room with the caller whose name or display name matches `query` (2+ characters). */
  searchContacts(query: string): Promise<ContactsResponse>;
}

export function createConversationsResource(session: SessionManager): ConversationsResource {
  const group = (roomId: string) => `/group-dms/${encodeURIComponent(roomId)}`;
  const member = (roomId: string, userId: string) =>
    `${group(roomId)}/members/${encodeURIComponent(userId)}`;
  const admin = (roomId: string, userId: string) =>
    `${group(roomId)}/admins/${encodeURIComponent(userId)}`;

  return {
    list() {
      return session.request<ConversationListResponse>('GET', '/me/conversations');
    },

    createDm(userId) {
      return session.request<Room>('POST', '/dms', { body: { userId } });
    },

    createGroup(body) {
      return session.request<Room>('POST', '/group-dms', { body });
    },

    rename(roomId, name) {
      return session.request<Room>('PATCH', group(roomId), { body: { name } });
    },

    addMembers(roomId, body) {
      return session.request<Membership[]>('POST', `${group(roomId)}/members`, { body });
    },

    removeMember(roomId, userId) {
      return session.request<void>('DELETE', member(roomId, userId));
    },

    grantAdmin(roomId, userId) {
      return session.request<void>('PUT', admin(roomId, userId));
    },

    revokeAdmin(roomId, userId) {
      return session.request<void>('DELETE', admin(roomId, userId));
    },

    searchContacts(query) {
      return session.request<ContactsResponse>('GET', '/me/contacts', { query: { query } });
    },
  };
}
