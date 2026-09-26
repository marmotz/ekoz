import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';
import {
  type MentionsMe,
  MentionsMeSchema,
  type MentionTarget,
  MentionTargetSchema,
} from './mention.types.js';

/** One emoji and the users who reacted with it, in order of first reaction. */
export const MessageReactionSchema = z.object({
  emoji: z.string(),
  userIds: z.array(z.string()),
});
export type MessageReaction = z.infer<typeof MessageReactionSchema>;

/** `Message`, as the API exposes it (technical.md §11). */
export const MessageViewSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  seq: z.string(),
  authorId: nullableString(),
  body: z.string(),
  replyToId: nullableString(),
  mentions: z.array(MentionTargetSchema),
  mentionsMe: MentionsMeSchema.nullable(),
  reactions: z.array(MessageReactionSchema),
  editedAt: z.iso.datetime().nullable(),
  redactedAt: z.iso.datetime().nullable(),
  hiddenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type MessageView = z.infer<typeof MessageViewSchema>;
export class MessageViewDto extends createZodDto(MessageViewSchema) {}

export interface MessageRow {
  id: string;
  roomId: string;
  seq: bigint;
  authorId: string | null;
  body: string;
  replyToId: string | null;
  editedAt: string | null;
  redactedAt: string | null;
  redactedById: string | null;
  hiddenAt: string | null;
  createdAt: string;
}

/**
 * `mentionsMe` is the viewer's own relation to the message, computed per
 * request: it is never part of a live event (events are shared by every
 * viewer) and is `null` for the author of the message.
 */
export function toMessageView(
  row: MessageRow,
  mentions: MentionTarget[],
  mentionsMe: MentionsMe | null = null,
  reactions: MessageReaction[] = [],
): MessageView {
  return {
    id: row.id,
    roomId: row.roomId,
    seq: row.seq.toString(),
    authorId: row.authorId,
    body: row.body,
    replyToId: row.replyToId,
    mentions,
    mentionsMe,
    reactions,
    editedAt: row.editedAt,
    redactedAt: row.redactedAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
  };
}

export interface ReactionRow {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

/**
 * Group reaction rows by message, then by emoji in order of first appearance
 * (`createdAt`, then `userId` as the deterministic tie-break).
 */
export function groupReactions(rows: ReactionRow[]): Map<string, MessageReaction[]> {
  const byMessage = new Map<string, MessageReaction[]>();
  const ordered = [...rows].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.userId.localeCompare(b.userId),
  );
  for (const row of ordered) {
    const groups = byMessage.get(row.messageId) ?? [];
    const group = groups.find((g) => g.emoji === row.emoji);
    if (group) {
      group.userIds.push(row.userId);
    } else {
      groups.push({ emoji: row.emoji, userIds: [row.userId] });
    }
    byMessage.set(row.messageId, groups);
  }

  return byMessage;
}
