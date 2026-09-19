import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { roomRoleSchema } from '../rooms/room.view.js';

export const InviteMemberSchema = z.object({
  userId: entityIdSchema,
  role: roomRoleSchema.default('member'),
});
export type InviteMember = z.infer<typeof InviteMemberSchema>;
export class InviteMemberDto extends createZodDto(InviteMemberSchema) {}

export const InvitationIdParamSchema = z.object({ id: entityIdSchema });

export const BanMemberSchema = z.object({
  userId: entityIdSchema,
  reason: z.string().trim().min(1).max(2000).optional(),
});
export type BanMember = z.infer<typeof BanMemberSchema>;
export class BanMemberDto extends createZodDto(BanMemberSchema) {}

export const ChangeRoleSchema = z.object({ role: roomRoleSchema });
export type ChangeRole = z.infer<typeof ChangeRoleSchema>;
export class ChangeRoleDto extends createZodDto(ChangeRoleSchema) {}

export const RoomMemberParamSchema = z.object({ id: entityIdSchema, userId: entityIdSchema });
export const JoinRequestParamSchema = z.object({ id: entityIdSchema, requestId: entityIdSchema });
