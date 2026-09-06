import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /auth/password-reset/request` body (technical.md §10). */
export const RequestPasswordResetSchema = z.object({
  email: z.email().max(320),
});
export type RequestPasswordResetBody = z.infer<typeof RequestPasswordResetSchema>;
export class RequestPasswordResetDto extends createZodDto(RequestPasswordResetSchema) {}

/** `POST /auth/password-reset/confirm` body (technical.md §10). */
export const ConfirmPasswordResetSchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(1024),
});
export type ConfirmPasswordResetBody = z.infer<typeof ConfirmPasswordResetSchema>;
export class ConfirmPasswordResetDto extends createZodDto(ConfirmPasswordResetSchema) {}

/** `POST /auth/password-reset/request` response — always `202`, never leaks account existence. */
export const AcceptedResponseSchema = z.object({ accepted: z.literal(true) });
export class AcceptedResponseDto extends createZodDto(AcceptedResponseSchema) {}
