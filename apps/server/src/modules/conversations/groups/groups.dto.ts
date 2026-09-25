import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { GROUP_NAME_PATTERN } from './group-name.js';

export const GroupNameSchema = z
  .string()
  .regex(GROUP_NAME_PATTERN, 'Must be 1 to 32 characters among a-z, 0-9, "_", "." and "-"');

export const GroupParamSchema = z.object({ id: entityIdSchema, groupId: entityIdSchema });
export const GroupMemberParamSchema = z.object({
  id: entityIdSchema,
  groupId: entityIdSchema,
  userId: entityIdSchema,
});

export const CreateGroupSchema = z.object({
  name: GroupNameSchema,
  memberIds: z.array(entityIdSchema).max(500).optional(),
});
export type CreateGroup = z.infer<typeof CreateGroupSchema>;
export class CreateGroupDto extends createZodDto(CreateGroupSchema) {}

export const RenameGroupSchema = z.object({ name: GroupNameSchema });
export type RenameGroup = z.infer<typeof RenameGroupSchema>;
export class RenameGroupDto extends createZodDto(RenameGroupSchema) {}
