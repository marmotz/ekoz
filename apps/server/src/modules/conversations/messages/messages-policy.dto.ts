import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `GET /messages/policy` response (backlog `web-client-composer-formatting`, technical.md S1). */
export const MessagesPolicySchema = z.object({
  /** `messages.body_max_length`: longest accepted message body, in UTF-16 code units. */
  bodyMaxLength: z.number().int(),
});
export type MessagesPolicyBody = z.infer<typeof MessagesPolicySchema>;
export class MessagesPolicyDto extends createZodDto(MessagesPolicySchema) {}
