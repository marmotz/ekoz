import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `GET /auth/policy` response (backlog `auth` feature, technical.md S1). */
export const AuthPolicySchema = z.object({
  /** `registration.mode`: who may create an account. */
  registrationMode: z.enum(['open', 'invite', 'admin']),
  /** `email.verification_required`: whether login is gated on a verified address. */
  emailVerificationRequired: z.boolean(),
  /** Minimum accepted password length. */
  passwordMinLength: z.number().int(),
  /** `link_previews.enabled`: whether the composer may request link previews. */
  linkPreviews: z.boolean(),
});
export type AuthPolicyBody = z.infer<typeof AuthPolicySchema>;
export class AuthPolicyDto extends createZodDto(AuthPolicySchema) {}
