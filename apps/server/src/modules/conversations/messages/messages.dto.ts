import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

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
