import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /stream/ticket` response — a single-use ticket for the SSE stream. */
export const StreamTicketResponseSchema = z.object({
  ticket: z.string(),
  /** Seconds until the ticket expires. */
  expiresIn: z.number().int(),
});
export type StreamTicketResponse = z.infer<typeof StreamTicketResponseSchema>;
export class StreamTicketResponseDto extends createZodDto(StreamTicketResponseSchema) {}
