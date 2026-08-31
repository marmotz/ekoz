import { z } from 'zod';

/** `POST /invitations` body (technical.md §8). */
export const CreateInvitationSchema = z.object({
  email: z.email().max(320).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateInvitationBody = z.infer<typeof CreateInvitationSchema>;
