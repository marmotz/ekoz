import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MessagePinViewSchema = z.object({
  roomId: z.string(),
  messageId: z.string(),
  pinnedById: z.string(),
  pinnedAt: z.iso.datetime(),
});
export type MessagePinView = z.infer<typeof MessagePinViewSchema>;
export class MessagePinViewDto extends createZodDto(MessagePinViewSchema) {}

export interface MessagePinRow {
  roomId: string;
  messageId: string;
  pinnedById: string;
  pinnedAt: string;
}
