import { z } from 'zod';

/**
 * `POST /setup/owner` body (technical.md §1, ADR 0010). `token` is required on a
 * token-pinned boot and ignored on an email-pinned one; the service enforces
 * the active rule.
 */
export const SetupOwnerSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
  name: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(100),
  token: z.string().min(1).max(512).optional(),
});
export type SetupOwnerBody = z.infer<typeof SetupOwnerSchema>;
