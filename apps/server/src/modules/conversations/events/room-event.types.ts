import { z } from 'zod';

/** Mirrors the `RoomEventType` enum in `contract.prisma` (technical.md §4). */
export type RoomEventType =
  | 'message_created'
  | 'message_edited'
  | 'message_redacted'
  | 'message_hidden'
  | 'reaction_added'
  | 'reaction_removed'
  | 'member_joined'
  | 'member_left'
  | 'member_kicked'
  | 'member_banned'
  | 'member_unbanned'
  | 'role_changed'
  | 'permission_override_changed'
  | 'room_created'
  | 'room_updated'
  | 'room_moved'
  | 'room_deleted'
  | 'pin_added'
  | 'pin_removed'
  | 'retention_changed'
  | 'receipt_updated';

const roomTypeSchema = z.enum(['space', 'channel', 'dm', 'group_dm']);
const roomVisibilitySchema = z.enum(['public', 'private', 'invite']);
const roomRoleSchema = z.enum(['space_admin', 'room_admin', 'moderator', 'member', 'reader']);

/**
 * Typed content payload per {@link RoomEventType} (technical.md §10, item 4),
 * shared with the protocol doc. Only `room_*` events (issue #1) have a payload
 * this increment actually writes; every other type is reserved for the issue
 * that owns its behaviour (#4, #7-#13) — its schema here is a permissive
 * placeholder, not yet the protocol-fixed shape.
 */
export const ROOM_EVENT_PAYLOAD_SCHEMAS = {
  room_created: z.object({
    type: roomTypeSchema,
    parentId: z.string().nullable(),
    visibility: roomVisibilitySchema,
    name: z.string().nullable(),
  }),
  room_updated: z
    .object({
      name: z.string().nullable(),
      topic: z.string().nullable(),
      visibility: roomVisibilitySchema,
      readOnly: z.boolean(),
      defaultRole: roomRoleSchema,
    })
    .partial(),
  room_moved: z.object({
    oldParentId: z.string().nullable(),
    newParentId: z.string().nullable(),
  }),
  room_deleted: z.object({}),

  // Placeholders: content shape is owned by the issue that implements the
  // behaviour, not fixed yet.
  message_created: z.record(z.string(), z.unknown()),
  message_edited: z.record(z.string(), z.unknown()),
  message_redacted: z.record(z.string(), z.unknown()),
  message_hidden: z.record(z.string(), z.unknown()),
  reaction_added: z.record(z.string(), z.unknown()),
  reaction_removed: z.record(z.string(), z.unknown()),
  member_joined: z.record(z.string(), z.unknown()),
  member_left: z.record(z.string(), z.unknown()),
  member_kicked: z.record(z.string(), z.unknown()),
  member_banned: z.record(z.string(), z.unknown()),
  member_unbanned: z.record(z.string(), z.unknown()),
  role_changed: z.record(z.string(), z.unknown()),
  permission_override_changed: z.record(z.string(), z.unknown()),
  pin_added: z.record(z.string(), z.unknown()),
  pin_removed: z.record(z.string(), z.unknown()),
  retention_changed: z.record(z.string(), z.unknown()),
  receipt_updated: z.record(z.string(), z.unknown()),
} as const satisfies Record<RoomEventType, z.ZodType>;

export type RoomEventContent<T extends RoomEventType> = z.infer<
  (typeof ROOM_EVENT_PAYLOAD_SCHEMAS)[T]
>;
