import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /auth/verify-email` body (technical.md §9). */
export const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});
export type VerifyEmailBody = z.infer<typeof VerifyEmailSchema>;
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}

/** `POST /auth/verify-email/resend` body (technical.md §9). */
export const ResendVerificationSchema = z.object({
  email: z.email().max(320),
});
export type ResendVerificationBody = z.infer<typeof ResendVerificationSchema>;
export class ResendVerificationDto extends createZodDto(ResendVerificationSchema) {}

/** `POST /me/email` body (technical.md §9). */
export const ChangeEmailSchema = z.object({
  newEmail: z.email().max(320),
  password: z.string().min(1).max(1024),
});
export type ChangeEmailBody = z.infer<typeof ChangeEmailSchema>;
export class ChangeEmailDto extends createZodDto(ChangeEmailSchema) {}

/** `POST /auth/verify-email` response. */
export const EmailVerifiedResponseSchema = z.object({ verified: z.literal(true) });
export class EmailVerifiedResponseDto extends createZodDto(EmailVerifiedResponseSchema) {}

/** `POST /auth/verify-email/resend` and `POST /me/email` response. */
export const EmailAcceptedResponseSchema = z.object({ accepted: z.literal(true) });
export class EmailAcceptedResponseDto extends createZodDto(EmailAcceptedResponseSchema) {}
