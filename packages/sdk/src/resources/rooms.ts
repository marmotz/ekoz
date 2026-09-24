/**
 * Rooms: the caller's tree, room detail and hierarchy, creation, membership
 * and join-request moderation (web-client-rooms technical design §3).
 */

import type { SessionManager } from '../session/session-manager.js';
import type {
  CreateChannelBody,
  CreateSpaceBody,
  JoinRequest,
  Membership,
  MembersPage,
  MyPermissionsResponse,
  PendingJoinRequestsPage,
  Room,
  RoomListResponse,
  RoomPreview,
} from '../types/wire.js';

export interface ListMembersParams {
  cursor?: string;
  limit?: number;
}

export interface ListJoinRequestsParams {
  cursor?: string;
  limit?: number;
}

export interface RoomsResource {
  /** The caller's spaces and channels, with the ancestor spaces that place them. */
  list(): Promise<RoomListResponse>;
  get(roomId: string): Promise<Room>;
  /** Name, topic and own join request of an invite-only room the caller cannot read. */
  preview(roomId: string): Promise<RoomPreview>;
  children(roomId: string): Promise<Room[]>;
  myPermissions(roomId: string): Promise<MyPermissionsResponse>;
  createSpace(body: CreateSpaceBody): Promise<Room>;
  createChannel(body: CreateChannelBody): Promise<Room>;
  join(roomId: string): Promise<Membership>;
  leave(roomId: string): Promise<void>;
  requestToJoin(roomId: string): Promise<JoinRequest>;
  listJoinRequests(
    roomId: string,
    params?: ListJoinRequestsParams,
  ): Promise<PendingJoinRequestsPage>;
  approveJoinRequest(roomId: string, requestId: string): Promise<Membership>;
  rejectJoinRequest(roomId: string, requestId: string): Promise<void>;
  members(roomId: string, params?: ListMembersParams): Promise<MembersPage>;
}

export function createRoomsResource(session: SessionManager): RoomsResource {
  const base = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;
  const joinRequest = (roomId: string, requestId: string) =>
    `${base(roomId)}/join-requests/${encodeURIComponent(requestId)}`;

  return {
    list() {
      return session.request<RoomListResponse>('GET', '/rooms');
    },

    get(roomId) {
      return session.request<Room>('GET', base(roomId));
    },

    preview(roomId) {
      return session.request<RoomPreview>('GET', `${base(roomId)}/preview`);
    },

    children(roomId) {
      return session.request<Room[]>('GET', `${base(roomId)}/children`);
    },

    myPermissions(roomId) {
      return session.request<MyPermissionsResponse>('GET', `${base(roomId)}/my-permissions`);
    },

    createSpace(body) {
      return session.request<Room>('POST', '/spaces', { body });
    },

    createChannel(body) {
      return session.request<Room>('POST', '/rooms', { body });
    },

    join(roomId) {
      return session.request<Membership>('POST', `${base(roomId)}/join`);
    },

    leave(roomId) {
      return session.request<void>('POST', `${base(roomId)}/leave`);
    },

    requestToJoin(roomId) {
      return session.request<JoinRequest>('POST', `${base(roomId)}/join-request`);
    },

    listJoinRequests(roomId, params = {}) {
      return session.request<PendingJoinRequestsPage>('GET', `${base(roomId)}/join-requests`, {
        query: { cursor: params.cursor, limit: params.limit },
      });
    },

    approveJoinRequest(roomId, requestId) {
      return session.request<Membership>('POST', `${joinRequest(roomId, requestId)}/approve`);
    },

    rejectJoinRequest(roomId, requestId) {
      return session.request<void>('POST', `${joinRequest(roomId, requestId)}/reject`);
    },

    members(roomId, params = {}) {
      return session.request<MembersPage>('GET', `${base(roomId)}/members`, {
        query: { cursor: params.cursor, limit: params.limit },
      });
    },
  };
}
