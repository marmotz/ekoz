import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SessionViewSchema } from './session.view.js';

/** `POST /auth/login` body (technical.md §11). */
export const LoginSchema = z.object({
  /** `name`, `name/server`, or the account email. */
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  deviceName: z.string().trim().min(1).max(100).optional(),
});
export type LoginBody = z.infer<typeof LoginSchema>;
export class LoginDto extends createZodDto(LoginSchema) {}

/** `POST /auth/refresh` body (technical.md §7). */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});
export type RefreshBody = z.infer<typeof RefreshSchema>;
export class RefreshDto extends createZodDto(RefreshSchema) {}

/** `PATCH /sessions/:id` body (technical.md §11). */
export const RenameSessionSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
});
export type RenameSessionBody = z.infer<typeof RenameSessionSchema>;
export class RenameSessionDto extends createZodDto(RenameSessionSchema) {}

/** Opaque access token + rotating refresh token pair (technical.md §7). */
export const TokenBundleSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access-token lifetime, in seconds. */
  expiresIn: z.number().int(),
});

/** `POST /auth/refresh` response. */
export class TokenBundleDto extends createZodDto(TokenBundleSchema) {}

/** `POST /auth/login` response — the token pair plus the created session. */
export const LoginResponseSchema = TokenBundleSchema.extend({
  session: SessionViewSchema,
});
export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}

/** `DELETE /sessions?all=true` response — how many other sessions were revoked. */
export const RevokeAllSessionsResponseSchema = z.object({ revoked: z.number().int() });
export class RevokeAllSessionsResponseDto extends createZodDto(RevokeAllSessionsResponseSchema) {}
