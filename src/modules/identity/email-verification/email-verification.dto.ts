import { z } from 'zod';

/** `POST /auth/verify-email` body (technical.md §9). */
export const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});
export type VerifyEmailBody = z.infer<typeof VerifyEmailSchema>;

/** `POST /auth/verify-email/resend` body (technical.md §9). */
export const ResendVerificationSchema = z.object({
  email: z.email().max(320),
});
export type ResendVerificationBody = z.infer<typeof ResendVerificationSchema>;

/** `POST /me/email` body (technical.md §9). */
export const ChangeEmailSchema = z.object({
  newEmail: z.email().max(320),
  password: z.string().min(1).max(1024),
});
export type ChangeEmailBody = z.infer<typeof ChangeEmailSchema>;
