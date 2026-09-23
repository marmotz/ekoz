import { z } from 'zod';
import { CAPABILITIES } from '../permissions/capabilities.js';
import { retentionRuleSchema } from '../retention/retention-rule.js';

/** Mirrors the `RoomEventType` enum in `contract.prisma` (technical.md §4). */
export type RoomEventType =
  | 'message_created'
  | 'message_edited'
  | 'message_redacted'
  | 'message_deleted'
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
const capabilitySchema = z.enum(CAPABILITIES);
const overrideEffectSchema = z.enum(['allow', 'deny']);

/**
 * Typed content payload per {@link RoomEventType} (technical.md §10, item 4),
 * shared with the protocol doc. Only `room_*` and `permission_override_changed`
 * (issues #1, #3) have a payload this increment actually writes; every other
 * type is reserved for the issue that owns its behaviour (#4, #7-#13) — its
 * schema here is a permissive placeholder, not yet the protocol-fixed shape.
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

  // Fixed shape (technical.md §6, permission-model.md, issue #3): the only
  // non-`room_*` event type this increment actually writes.
  permission_override_changed: z.discriminatedUnion('scope', [
    z.object({
      scope: z.literal('role'),
      role: roomRoleSchema,
      capability: capabilitySchema,
      effect: overrideEffectSchema,
    }),
    z.object({
      scope: z.literal('user'),
      userId: z.string(),
      capability: capabilitySchema,
      effect: overrideEffectSchema,
    }),
  ]),

  // Fixed shape (technical.md §9, issue #4). `senderId` on the event already
  // carries the actor (inviter / kicker / banner / ...); content is only the
  // delta.
  member_joined: z.object({ userId: z.string(), role: roomRoleSchema }),
  member_left: z.object({ userId: z.string() }),
  member_kicked: z.object({ userId: z.string() }),
  member_banned: z.object({ userId: z.string(), reason: z.string().nullable() }),
  member_unbanned: z.object({ userId: z.string() }),
  role_changed: z.object({ userId: z.string(), role: roomRoleSchema }),

  // Fixed shape (technical.md §11, issue #7).
  message_created: z.object({
    messageId: z.string(),
    body: z.string(),
    replyToId: z.string().nullable(),
    mentions: z.array(z.string()),
  }),
  // Fixed shape (technical.md §11, issue #7). `senderId` carries the pinner.
  pin_added: z.object({ messageId: z.string() }),
  pin_removed: z.object({ messageId: z.string() }),

  // Fixed shape (technical.md §12, retention-and-tombstones.md, issue #8).
  // `message_redacted` REWRITES the original `message_created` row in place
  // (same `seq`, no new event) so the deleted body never lingers in the
  // event log — the retention worker (#12) reuses the same rewrite for
  // `reason: "retention"`.
  message_edited: z.object({ messageId: z.string(), editedAt: z.iso.datetime() }),
  message_redacted: z.object({ reason: z.enum(['user', 'retention']) }),
  // Live notification of a deletion, appended next to the in-place tombstone
  // with its own `seq`; `messageSeq` is the `seq` of the original row.
  message_deleted: z.object({
    messageId: z.string(),
    messageSeq: z.string(),
    reason: z.enum(['user', 'retention']),
  }),

  // Fixed shape (technical.md §11, §14, issue #9). `senderId` carries the
  // reactor / the user whose marker moved.
  reaction_added: z.object({ messageId: z.string(), emoji: z.string() }),
  reaction_removed: z.object({ messageId: z.string(), emoji: z.string() }),
  receipt_updated: z.object({ userId: z.string(), seq: z.string() }),

  // Fixed shape (technical.md §13, issue #12). Own `seq` (unlike
  // `message_redacted`, which rewrites the original event): `messageId`
  // identifies the affected message.
  message_hidden: z.object({ messageId: z.string() }),
  // Fixed shape (technical.md §13, issue #12). `rule` is the node's own new
  // rule (never the resolved effective rule).
  retention_changed: z.object({ rule: retentionRuleSchema }),
} as const satisfies Record<RoomEventType, z.ZodType>;

export type RoomEventContent<T extends RoomEventType> = z.infer<
  (typeof ROOM_EVENT_PAYLOAD_SCHEMAS)[T]
>;
