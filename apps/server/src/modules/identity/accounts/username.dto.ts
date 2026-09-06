import { z } from 'zod';

/** `PATCH /me/username` body (technical.md §17). */
export const ChangeUsernameSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
export type ChangeUsernameBody = z.infer<typeof ChangeUsernameSchema>;
