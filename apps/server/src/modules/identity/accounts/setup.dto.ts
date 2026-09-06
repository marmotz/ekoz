import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SessionViewSchema } from '../auth/session.view.js';
import { AccountViewSchema } from './account.view.js';

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
export class SetupOwnerDto extends createZodDto(SetupOwnerSchema) {}

/** `POST /setup/owner` response — the new owner account plus its first session. */
export const SetupOwnerResponseSchema = z.object({
  user: AccountViewSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  session: SessionViewSchema,
});
export type SetupOwnerResponse = z.infer<typeof SetupOwnerResponseSchema>;
export class SetupOwnerResponseDto extends createZodDto(SetupOwnerResponseSchema) {}
