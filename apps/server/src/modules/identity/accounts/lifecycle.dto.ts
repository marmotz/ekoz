import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /admin/users/:id/suspend` body (technical.md §15). */
export const SuspendUserSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type SuspendUserBody = z.infer<typeof SuspendUserSchema>;
export class SuspendUserDto extends createZodDto(SuspendUserSchema) {}

/** `DELETE /me` body — re-authentication (technical.md §15). */
export const DeleteMeSchema = z.object({
  password: z.string().min(1).max(1024),
});
export type DeleteMeBody = z.infer<typeof DeleteMeSchema>;
export class DeleteMeDto extends createZodDto(DeleteMeSchema) {}

/** `POST /admin/owners` body (technical.md §15). */
export const AddOwnerSchema = z.object({
  userId: z.string().min(1).max(64),
});
export type AddOwnerBody = z.infer<typeof AddOwnerSchema>;
export class AddOwnerDto extends createZodDto(AddOwnerSchema) {}
