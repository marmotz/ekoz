import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

export const RenameGroupDmSchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().meta({ type: 'string', nullable: true }),
});
export type RenameGroupDm = z.infer<typeof RenameGroupDmSchema>;
export class RenameGroupDmDto extends createZodDto(RenameGroupDmSchema) {}

export const AddGroupDmMembersSchema = z.object({
  userIds: z.array(entityIdSchema).min(1).max(49),
  history: z.enum(['full', 'none']).default('full'),
});
export type AddGroupDmMembers = z.infer<typeof AddGroupDmMembersSchema>;
export class AddGroupDmMembersDto extends createZodDto(AddGroupDmMembersSchema) {}

export const GroupDmIdParamSchema = z.object({ id: entityIdSchema });
export const GroupDmMemberParamSchema = z.object({ id: entityIdSchema, userId: entityIdSchema });
