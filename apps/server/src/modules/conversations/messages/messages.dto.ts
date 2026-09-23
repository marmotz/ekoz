import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { MessageViewSchema } from './message.view.js';

export const SendMessageSchema = z.object({
  body: z.string().min(1),
  replyToId: entityIdSchema.optional(),
  mentions: z.array(entityIdSchema).max(100).optional(),
});
export type SendMessage = z.infer<typeof SendMessageSchema>;
export class SendMessageDto extends createZodDto(SendMessageSchema) {}

export const MessageIdParamSchema = z.object({ id: entityIdSchema, messageId: entityIdSchema });

export const EditMessageSchema = z.object({ body: z.string().min(1) });
export type EditMessage = z.infer<typeof EditMessageSchema>;
export class EditMessageDto extends createZodDto(EditMessageSchema) {}

export const ListMessagesQuerySchema = z.object({
  before: z.string().regex(/^\d+$/, 'Must be a non-negative integer').optional(),
  limit: z.coerce.number().int().min(1).optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export class ListMessagesQueryDto extends createZodDto(ListMessagesQuerySchema) {}

export const MessagePageSchema = z.object({
  items: z.array(MessageViewSchema),
  lastSeq: z.string(),
  hasMore: z.boolean(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;
export class MessagePageDto extends createZodDto(MessagePageSchema) {}
