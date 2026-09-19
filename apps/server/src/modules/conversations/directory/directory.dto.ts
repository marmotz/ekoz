import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';
import { RoomViewSchema } from '../rooms/room.view.js';

export const DirectoryQuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});
export type DirectoryQuery = z.infer<typeof DirectoryQuerySchema>;
export class DirectoryQueryDto extends createZodDto(DirectoryQuerySchema) {}

export const DirectoryListResponseSchema = z.object({
  items: z.array(RoomViewSchema),
  nextCursor: nullableString(),
});
export type DirectoryListResponse = z.infer<typeof DirectoryListResponseSchema>;
export class DirectoryListResponseDto extends createZodDto(DirectoryListResponseSchema) {}
