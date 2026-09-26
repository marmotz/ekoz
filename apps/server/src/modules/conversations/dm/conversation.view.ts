import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserSummarySchema } from '../../../core/users/user-summary.js';
import { RoomViewSchema } from '../rooms/room.view.js';

/** Another member of a conversation, with whether they administer it. */
export const ConversationParticipantSchema = z.object({
  user: UserSummarySchema,
  isAdmin: z.boolean(),
});
export type ConversationParticipant = z.infer<typeof ConversationParticipantSchema>;

/**
 * A `dm` / `group_dm` of the caller, as listed by `GET /me/conversations`:
 * every `Room` field plus the last activity, the other participants and the
 * caller's own admin flag.
 */
export const ConversationListItemSchema = RoomViewSchema.extend({
  lastActivityAt: z.iso.datetime(),
  participants: z.array(ConversationParticipantSchema),
  isAdmin: z.boolean(),
});
export type ConversationListItem = z.infer<typeof ConversationListItemSchema>;

export const ConversationListResponseSchema = z.object({
  items: z.array(ConversationListItemSchema),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;
export class ConversationListResponseDto extends createZodDto(ConversationListResponseSchema) {}
