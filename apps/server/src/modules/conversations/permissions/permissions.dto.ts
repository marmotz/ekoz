import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { CAPABILITIES } from './capabilities.js';

const capabilitySchema = z.enum(CAPABILITIES);
const overrideEffectSchema = z.enum(['allow', 'deny']);
const roomRoleSchema = z.enum(['space_admin', 'room_admin', 'moderator', 'member', 'reader']);

export const MyPermissionsResponseSchema = z.object({ capabilities: z.array(capabilitySchema) });
export type MyPermissionsResponse = z.infer<typeof MyPermissionsResponseSchema>;
export class MyPermissionsResponseDto extends createZodDto(MyPermissionsResponseSchema) {}

export const SetRolePermissionSchema = z.object({
  role: roomRoleSchema,
  capability: capabilitySchema,
  effect: overrideEffectSchema,
});
export type SetRolePermission = z.infer<typeof SetRolePermissionSchema>;
export class SetRolePermissionDto extends createZodDto(SetRolePermissionSchema) {}

export const SetMemberPermissionSchema = z.object({
  capability: capabilitySchema,
  effect: overrideEffectSchema,
});
export type SetMemberPermission = z.infer<typeof SetMemberPermissionSchema>;
export class SetMemberPermissionDto extends createZodDto(SetMemberPermissionSchema) {}

export const RoomMemberIdParamSchema = z.object({ id: entityIdSchema, userId: entityIdSchema });
