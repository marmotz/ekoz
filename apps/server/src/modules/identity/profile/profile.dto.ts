import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';
import { AccountViewSchema } from '../accounts/account.view.js';

/**
 * `PATCH /me/profile` body (technical.md §13). Both fields optional; `bio` is
 * length-checked against `profile.bio_max_length` in the service. `bio: null`
 * clears it.
 */
export const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().max(4096).nullable().meta({ type: 'string', nullable: true }).optional(),
  })
  .refine((body) => body.displayName !== undefined || body.bio !== undefined, {
    message: 'Provide at least one of displayName or bio.',
  });
export type UpdateProfileBody = z.infer<typeof UpdateProfileSchema>;
export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}

/** `GET /me` / `PATCH /me/profile` response (technical.md §13). */
export const MeViewSchema = AccountViewSchema.extend({
  bio: nullableString(),
  avatarUrl: z.url().nullable(),
  /** Address of an email change awaiting verification; `null` when none. */
  pendingEmail: z.email().nullable(),
});
export class MeViewDto extends createZodDto(MeViewSchema) {}

/** `GET /users/:identifier` response (technical.md §13). */
export const PublicProfileViewSchema = z.object({
  identifier: z.string(),
  displayName: z.string(),
  bio: nullableString(),
  avatarUrl: z.url().nullable(),
});
export class PublicProfileViewDto extends createZodDto(PublicProfileViewSchema) {}

/** `PUT /me/avatar` response. */
export const AvatarUploadedSchema = z.object({ avatarUrl: z.string() });
export class AvatarUploadedDto extends createZodDto(AvatarUploadedSchema) {}
