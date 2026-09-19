import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { roomVisibilitySchema } from './room.view.js';

export const RoomIdParamSchema = z.object({ id: entityIdSchema });

export const CreateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(2000).optional(),
  visibility: roomVisibilitySchema.default('private'),
  parentId: entityIdSchema.optional(),
});
export type CreateSpace = z.infer<typeof CreateSpaceSchema>;
export class CreateSpaceDto extends createZodDto(CreateSpaceSchema) {}

export const CreateChannelSchema = z.object({
  parentId: entityIdSchema,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Must be lowercase letters, digits and hyphens only')
    .min(1)
    .max(100)
    .optional(),
  name: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(2000).optional(),
  visibility: roomVisibilitySchema.default('private'),
});
export type CreateChannel = z.infer<typeof CreateChannelSchema>;
export class CreateChannelDto extends createZodDto(CreateChannelSchema) {}

export const UpdateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable(),
    topic: z.string().trim().max(2000).nullable(),
    visibility: roomVisibilitySchema,
    readOnly: z.boolean(),
  })
  .partial();
export type UpdateRoom = z.infer<typeof UpdateRoomSchema>;
export class UpdateRoomDto extends createZodDto(UpdateRoomSchema) {}

export const MoveRoomSchema = z.object({ parentId: entityIdSchema.nullable() });
export type MoveRoom = z.infer<typeof MoveRoomSchema>;
export class MoveRoomDto extends createZodDto(MoveRoomSchema) {}
