import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { MentionInputSchema } from './mention.types.js';
import { MessageViewSchema } from './message.view.js';

export const SendMessageSchema = z.object({
  body: z.string().min(1),
  replyToId: entityIdSchema.optional(),
  mentions: z.array(MentionInputSchema).max(100).optional(),
});
export type SendMessage = z.infer<typeof SendMessageSchema>;
export class SendMessageDto extends createZodDto(SendMessageSchema) {}

export const MessageIdParamSchema = z.object({ id: entityIdSchema, messageId: entityIdSchema });

export const EditMessageSchema = z.object({
  body: z.string().min(1),
  /** Absent: the targets stay as they are. Present: the full new list. */
  mentions: z.array(MentionInputSchema).max(100).optional(),
});
export type EditMessage = z.infer<typeof EditMessageSchema>;
export class EditMessageDto extends createZodDto(EditMessageSchema) {}

const seqParamSchema = z.string().regex(/^\d+$/, 'Must be a non-negative integer');

export const ListMessagesQuerySchema = z
  .object({
    before: seqParamSchema.optional(),
    after: seqParamSchema.optional(),
    around: seqParamSchema.optional(),
    limit: z.coerce.number().int().min(1).optional(),
  })
  .refine(
    (query) =>
      [query.before, query.after, query.around].filter((value) => value !== undefined).length <= 1,
    { message: 'At most one of "before", "after" and "around" may be set', path: ['before'] },
  );
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export class ListMessagesQueryDto extends createZodDto(ListMessagesQuerySchema) {}

export const MessagePageSchema = z.object({
  items: z.array(MessageViewSchema),
  lastSeq: z.string(),
  hasMore: z.boolean(),
  hasMoreNewer: z.boolean(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;
export class MessagePageDto extends createZodDto(MessagePageSchema) {}
