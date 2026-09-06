import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

/** `POST /invitations` body (technical.md §8). */
export const CreateInvitationSchema = z.object({
  email: z.email().max(320).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateInvitationBody = z.infer<typeof CreateInvitationSchema>;
export class CreateInvitationDto extends createZodDto(CreateInvitationSchema) {}

export const invitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** `POST /invitations` response — the opaque token is returned once only. */
export const CreatedInvitationSchema = z.object({
  id: entityIdSchema,
  token: z.string(),
  url: z.url(),
});
export type CreatedInvitation = z.infer<typeof CreatedInvitationSchema>;
export class CreatedInvitationDto extends createZodDto(CreatedInvitationSchema) {}

/** `GET /invitations` list item (never exposes the token hash). */
export const InvitationViewSchema = z.object({
  id: entityIdSchema,
  email: z.email().nullable(),
  createdByUserId: entityIdSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  consumedAt: z.iso.datetime().nullable(),
  consumedByUserId: entityIdSchema.nullable(),
  status: invitationStatusSchema,
});
export type InvitationView = z.infer<typeof InvitationViewSchema>;
export class InvitationViewDto extends createZodDto(InvitationViewSchema) {}
