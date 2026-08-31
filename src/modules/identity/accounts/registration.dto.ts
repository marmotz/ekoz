import { z } from 'zod';

/**
 * `POST /auth/register` body (technical.md §8). `invitationToken` is required
 * only in `invite` mode; the service enforces that.
 */
export const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(64),
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
  displayName: z.string().trim().min(1).max(100),
  invitationToken: z.string().min(1).max(512).optional(),
});
export type RegisterBody = z.infer<typeof RegisterSchema>;

/** `POST /admin/users` body (technical.md §8, owner-only account creation). */
export const AdminCreateUserSchema = RegisterSchema.omit({ invitationToken: true }).extend({
  isOwner: z.boolean().optional(),
});
export type AdminCreateUserBody = z.infer<typeof AdminCreateUserSchema>;
