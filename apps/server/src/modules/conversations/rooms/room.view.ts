import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';

export const roomTypeSchema = z.enum(['space', 'channel', 'dm', 'group_dm']);
export const roomVisibilitySchema = z.enum(['public', 'private', 'invite']);
export const roomRoleSchema = z.enum([
  'space_admin',
  'room_admin',
  'moderator',
  'member',
  'reader',
]);

/** `Room`, as the API exposes it. `lastSeq` is a `bigint` in storage — serialised as a decimal string. */
export const RoomViewSchema = z.object({
  id: z.string(),
  type: roomTypeSchema,
  parentId: nullableString(),
  visibility: roomVisibilitySchema,
  slug: nullableString(),
  name: nullableString(),
  topic: nullableString(),
  avatarBlobId: nullableString(),
  defaultRole: roomRoleSchema,
  readOnly: z.boolean(),
  originServer: z.string(),
  lastSeq: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RoomView = z.infer<typeof RoomViewSchema>;
export class RoomViewDto extends createZodDto(RoomViewSchema) {}

export interface RoomRow {
  id: string;
  type: z.infer<typeof roomTypeSchema>;
  parentId: string | null;
  visibility: z.infer<typeof roomVisibilitySchema>;
  slug: string | null;
  name: string | null;
  topic: string | null;
  avatarBlobId: string | null;
  defaultRole: z.infer<typeof roomRoleSchema>;
  readOnly: boolean;
  originServer: string;
  lastSeq: bigint;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function toRoomView(row: RoomRow): RoomView {
  return {
    id: row.id,
    type: row.type as RoomView['type'],
    parentId: row.parentId,
    visibility: row.visibility as RoomView['visibility'],
    slug: row.slug,
    name: row.name,
    topic: row.topic,
    avatarBlobId: row.avatarBlobId,
    defaultRole: row.defaultRole as RoomView['defaultRole'],
    readOnly: row.readOnly,
    originServer: row.originServer,
    lastSeq: row.lastSeq.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
