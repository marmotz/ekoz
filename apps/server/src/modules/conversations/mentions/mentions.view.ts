import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';
import { MentionsMeSchema } from '../messages/mention.types.js';
import { MessageViewSchema } from '../messages/message.view.js';
import { roomTypeSchema } from '../rooms/room.view.js';

/** Unread mentions of the caller in one room (web-client-mentions technical.md S5). */
export const UnreadMentionsSchema = z.object({
  roomId: z.string(),
  direct: z.number().int().min(0),
  collective: z.number().int().min(0),
});
export type UnreadMentions = z.infer<typeof UnreadMentionsSchema>;

export const UnreadMentionsViewSchema = z.object({ items: z.array(UnreadMentionsSchema) });
export type UnreadMentionsView = z.infer<typeof UnreadMentionsViewSchema>;
export class UnreadMentionsViewDto extends createZodDto(UnreadMentionsViewSchema) {}

export const MyMentionSchema = z.object({
  message: MessageViewSchema,
  room: z.object({
    id: z.string(),
    type: roomTypeSchema,
    name: nullableString(),
    parentId: nullableString(),
  }),
  mentionsMe: MentionsMeSchema,
  unread: z.boolean(),
});
export type MyMention = z.infer<typeof MyMentionSchema>;

export const MyMentionsPageSchema = z.object({
  items: z.array(MyMentionSchema),
  nextCursor: nullableString(),
});
export type MyMentionsPage = z.infer<typeof MyMentionsPageSchema>;
export class MyMentionsPageDto extends createZodDto(MyMentionsPageSchema) {}
