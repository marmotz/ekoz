import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import { UserSummarySchema } from '../../../core/users/user-summary.js';
import { roomRoleSchema, roomTypeSchema, roomVisibilitySchema } from '../rooms/room.view.js';

/** `Membership`, as the API exposes it (technical.md §9). */
export const MembershipViewSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  role: roomRoleSchema,
  joinedAt: z.iso.datetime(),
  invitedById: nullableString(),
});
export type MembershipView = z.infer<typeof MembershipViewSchema>;
export class MembershipViewDto extends createZodDto(MembershipViewSchema) {}

export interface MembershipRow {
  roomId: string;
  userId: string;
  role: z.infer<typeof roomRoleSchema>;
  joinedAt: string;
  invitedById: string | null;
}

export function toMembershipView(row: MembershipRow): MembershipView {
  return {
    roomId: row.roomId,
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
    invitedById: row.invitedById,
  };
}

/** `RoomInvitation`, as the API exposes it. */
export const RoomInvitationViewSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  invitedById: z.string(),
  role: roomRoleSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  declinedAt: z.iso.datetime().nullable(),
});
export type RoomInvitationView = z.infer<typeof RoomInvitationViewSchema>;
export class RoomInvitationViewDto extends createZodDto(RoomInvitationViewSchema) {}

export interface RoomInvitationRow {
  id: string;
  roomId: string;
  userId: string;
  invitedById: string;
  role: z.infer<typeof roomRoleSchema>;
  createdAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
}

export function toRoomInvitationView(row: RoomInvitationRow): RoomInvitationView {
  return { ...row };
}

/** `RoomJoinRequest`, as the API exposes it. */
export const JoinRequestViewSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  resolvedById: nullableString(),
  approved: z.boolean().nullable(),
});
export type JoinRequestView = z.infer<typeof JoinRequestViewSchema>;
export class JoinRequestViewDto extends createZodDto(JoinRequestViewSchema) {}

export interface JoinRequestRow {
  id: string;
  roomId: string;
  userId: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  approved: boolean | null;
}

export function toJoinRequestView(row: JoinRequestRow): JoinRequestView {
  return { ...row };
}

/** A pending invitation of the caller, with enough of the room and the inviter to show it. */
export const MyRoomInvitationViewSchema = z.object({
  id: entityIdSchema,
  role: roomRoleSchema,
  createdAt: z.iso.datetime(),
  room: z.object({
    id: entityIdSchema,
    type: roomTypeSchema,
    name: nullableString(),
    topic: nullableString(),
    visibility: roomVisibilitySchema,
  }),
  invitedBy: UserSummarySchema,
});
export type MyRoomInvitationView = z.infer<typeof MyRoomInvitationViewSchema>;

export const MyRoomInvitationListViewSchema = z.object({
  items: z.array(MyRoomInvitationViewSchema),
});
export type MyRoomInvitationListView = z.infer<typeof MyRoomInvitationListViewSchema>;
export class MyRoomInvitationListViewDto extends createZodDto(MyRoomInvitationListViewSchema) {}

/** An effective member of a room: its role and join date come from the nearest membership. */
export const MemberViewSchema = z.object({
  role: roomRoleSchema,
  joinedAt: z.iso.datetime(),
  user: UserSummarySchema,
});
export type MemberView = z.infer<typeof MemberViewSchema>;

export const MemberListViewSchema = z.object({
  items: z.array(MemberViewSchema),
  nextCursor: nullableString(),
});
export type MemberListView = z.infer<typeof MemberListViewSchema>;
export class MemberListViewDto extends createZodDto(MemberListViewSchema) {}

/** A pending join request, with the requester to show it in a moderation queue. */
export const PendingJoinRequestViewSchema = z.object({
  id: entityIdSchema,
  roomId: entityIdSchema,
  createdAt: z.iso.datetime(),
  user: UserSummarySchema,
});
export type PendingJoinRequestView = z.infer<typeof PendingJoinRequestViewSchema>;

export const PendingJoinRequestListViewSchema = z.object({
  items: z.array(PendingJoinRequestViewSchema),
  nextCursor: nullableString(),
});
export type PendingJoinRequestListView = z.infer<typeof PendingJoinRequestListViewSchema>;
export class PendingJoinRequestListViewDto extends createZodDto(PendingJoinRequestListViewSchema) {}
