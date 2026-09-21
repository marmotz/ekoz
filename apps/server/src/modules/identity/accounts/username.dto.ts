import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

/** `PATCH /me/username` body (technical.md §17). */
export const ChangeUsernameSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
export type ChangeUsernameBody = z.infer<typeof ChangeUsernameSchema>;
export class ChangeUsernameDto extends createZodDto(ChangeUsernameSchema) {}

/**
 * `PATCH /me/username` response: either the change was applied immediately, or
 * an owner-approval request was queued (technical.md §17). Modelled as two
 * OpenAPI components combined with `oneOf` on the route (a discriminated union
 * is not a single object type).
 */
export const UsernameChangeAppliedSchema = z.object({
  status: z.literal('applied'),
  identifier: z.string(),
});
export class UsernameChangeAppliedDto extends createZodDto(UsernameChangeAppliedSchema) {}

export const UsernameChangePendingSchema = z.object({
  status: z.literal('pending'),
  requestId: entityIdSchema,
});
export class UsernameChangePendingDto extends createZodDto(UsernameChangePendingSchema) {}

export const UsernameChangeOutcomeSchema = z.union([
  UsernameChangeAppliedSchema,
  UsernameChangePendingSchema,
]);
export type UsernameChangeOutcome = z.infer<typeof UsernameChangeOutcomeSchema>;

/** `GET /me/username` response: what a client needs to render the change form. */
export const UsernameChangeStateSchema = z.object({
  /**
   * `immutable` | `available` | `approval` (`identity.username_change_policy`).
   * Typed as a plain string on purpose: tako emits an unresolved enum type import
   * for a DTO that mixes an inline enum with a nested object, which breaks the
   * generated SDK types.
   */
  policy: z.string(),
  /** End of the cooldown; non-null only for `available` while it runs. */
  nextChangeAt: z.iso.datetime().nullable(),
  pendingRequest: z
    .object({
      id: entityIdSchema,
      requestedName: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
});
export type UsernameChangeState = z.infer<typeof UsernameChangeStateSchema>;
export class UsernameChangeStateDto extends createZodDto(UsernameChangeStateSchema) {}

/** `POST /admin/username-requests/:id/approve` response. */
export const UsernameApprovedSchema = z.object({ identifier: z.string() });
export class UsernameApprovedDto extends createZodDto(UsernameApprovedSchema) {}

/** `GET /admin/username-requests` list item (technical.md §17). */
export const UsernameChangeRequestSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  requestedName: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  resolvedByUserId: entityIdSchema.nullable(),
});
export class UsernameChangeRequestDto extends createZodDto(UsernameChangeRequestSchema) {}
