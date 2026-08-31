import { z } from 'zod';

/** `POST /auth/login` body (technical.md §11). */
export const LoginSchema = z.object({
  /** `name`, `name/server`, or the account email. */
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  deviceName: z.string().trim().min(1).max(100).optional(),
});
export type LoginBody = z.infer<typeof LoginSchema>;

/** `POST /auth/refresh` body (technical.md §7). */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});
export type RefreshBody = z.infer<typeof RefreshSchema>;

/** `PATCH /sessions/:id` body (technical.md §11). */
export const RenameSessionSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
});
export type RenameSessionBody = z.infer<typeof RenameSessionSchema>;
