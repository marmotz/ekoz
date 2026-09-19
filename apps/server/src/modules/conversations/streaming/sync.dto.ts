import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';

export const SyncQuerySchema = z.object({
  room: entityIdSchema,
  since: z.string().regex(/^\d+$/, 'Must be a non-negative integer').default('0'),
  limit: z.coerce.number().int().min(1).optional(),
});
export type SyncQuery = z.infer<typeof SyncQuerySchema>;
export class SyncQueryDto extends createZodDto(SyncQuerySchema) {}

export const RoomEventViewSchema = z.object({
  roomId: z.string(),
  seq: z.string(),
  type: z.string(),
  senderId: nullableString(),
  content: z.unknown(),
  originServer: z.string(),
  createdAt: z.iso.datetime(),
});
export type RoomEventView = z.infer<typeof RoomEventViewSchema>;
export class RoomEventViewDto extends createZodDto(RoomEventViewSchema) {}

export const SyncResponseSchema = z.object({
  events: z.array(RoomEventViewSchema),
  lastSeq: z.string(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export class SyncResponseDto extends createZodDto(SyncResponseSchema) {}
