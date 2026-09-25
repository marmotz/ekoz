/**
 * Room groups: named member sets defined on a room or space and mentioned as
 * `@<name>` (web-client-mentions technical design §4).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { GroupDetail, GroupListResponse } from '../types/wire.js';

/** `POST /rooms/:id/groups` body. Not in the OpenAPI description, so declared by hand. */
export interface CreateGroupBody {
  name: string;
  memberIds?: string[];
}

export interface GroupsResource {
  /** Groups defined on the room and on its ancestors. */
  list(roomId: string): Promise<GroupListResponse>;
  get(roomId: string, groupId: string): Promise<GroupDetail>;
  create(roomId: string, body: CreateGroupBody): Promise<GroupDetail>;
  rename(roomId: string, groupId: string, name: string): Promise<GroupDetail>;
  remove(roomId: string, groupId: string): Promise<void>;
  addMember(roomId: string, groupId: string, userId: string): Promise<void>;
  removeMember(roomId: string, groupId: string, userId: string): Promise<void>;
}

export function createGroupsResource(session: SessionManager): GroupsResource {
  const base = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}/groups`;
  const group = (roomId: string, groupId: string) =>
    `${base(roomId)}/${encodeURIComponent(groupId)}`;
  const member = (roomId: string, groupId: string, userId: string) =>
    `${group(roomId, groupId)}/members/${encodeURIComponent(userId)}`;

  return {
    list(roomId) {
      return session.request<GroupListResponse>('GET', base(roomId));
    },

    get(roomId, groupId) {
      return session.request<GroupDetail>('GET', group(roomId, groupId));
    },

    create(roomId, body) {
      return session.request<GroupDetail>('POST', base(roomId), { body });
    },

    rename(roomId, groupId, name) {
      return session.request<GroupDetail>('PATCH', group(roomId, groupId), { body: { name } });
    },

    remove(roomId, groupId) {
      return session.request<void>('DELETE', group(roomId, groupId));
    },

    addMember(roomId, groupId, userId) {
      return session.request<void>('PUT', member(roomId, groupId, userId));
    },

    removeMember(roomId, groupId, userId) {
      return session.request<void>('DELETE', member(roomId, groupId, userId));
    },
  };
}
