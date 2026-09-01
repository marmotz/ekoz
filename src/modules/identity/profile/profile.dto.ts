import { z } from 'zod';

/**
 * `PATCH /me/profile` body (technical.md §13). Both fields optional; `bio` is
 * length-checked against `profile.bio_max_length` in the service. `bio: null`
 * clears it.
 */
export const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().max(4096).nullable().optional(),
  })
  .refine((body) => body.displayName !== undefined || body.bio !== undefined, {
    message: 'Provide at least one of displayName or bio.',
  });
export type UpdateProfileBody = z.infer<typeof UpdateProfileSchema>;
