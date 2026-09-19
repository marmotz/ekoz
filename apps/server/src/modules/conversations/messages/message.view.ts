import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';

/** `Message`, as the API exposes it (technical.md §11). */
export const MessageViewSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  seq: z.string(),
  authorId: nullableString(),
  body: z.string(),
  replyToId: nullableString(),
  mentions: z.array(z.string()),
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

export function toMessageView(row: MessageRow, mentions: string[]): MessageView {
  return {
    id: row.id,
    roomId: row.roomId,
    seq: row.seq.toString(),
    authorId: row.authorId,
    body: row.body,
    replyToId: row.replyToId,
    mentions,
    editedAt: row.editedAt,
    redactedAt: row.redactedAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
  };
}
