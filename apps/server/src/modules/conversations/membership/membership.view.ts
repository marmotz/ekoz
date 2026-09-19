import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';
import { roomRoleSchema } from '../rooms/room.view.js';

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
