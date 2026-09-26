import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MessageViewSchema } from './message.view.js';

export const MessagePinViewSchema = z.object({
  roomId: z.string(),
  messageId: z.string(),
  pinnedById: z.string(),
  pinnedAt: z.iso.datetime(),
  message: MessageViewSchema,
});
export type MessagePinView = z.infer<typeof MessagePinViewSchema>;
export class MessagePinViewDto extends createZodDto(MessagePinViewSchema) {}

export interface MessagePinRow {
  roomId: string;
  messageId: string;
  pinnedById: string;
  pinnedAt: string;
}
