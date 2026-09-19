import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

export const CreateDmSchema = z.object({ userId: entityIdSchema });
export type CreateDm = z.infer<typeof CreateDmSchema>;
export class CreateDmDto extends createZodDto(CreateDmSchema) {}

export const CreateGroupDmSchema = z.object({
  userIds: z.array(entityIdSchema).min(1).max(50),
  name: z.string().trim().min(1).max(200).optional(),
});
export type CreateGroupDm = z.infer<typeof CreateGroupDmSchema>;
export class CreateGroupDmDto extends createZodDto(CreateGroupDmSchema) {}
