import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /me/password` body — re-authentication plus the new password. */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordSchema>;
export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
