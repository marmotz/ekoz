import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import { userIdentifier } from '../../../core/http/user-links.js';
import type { UserRecord } from './account.service.js';

export const accountStatusSchema = z.enum(['active', 'suspended', 'deleted']);

/** The client-facing summary of an account (technical.md §13, §16). */
export const AccountViewSchema = z.object({
  id: entityIdSchema,
  /** Canonical `name/server` identifier; `null` for a deleted account. */
  identifier: nullableString(),
  email: z.email().nullable(),
  displayName: z.string(),
  isOwner: z.boolean(),
  emailVerified: z.boolean(),
  status: accountStatusSchema,
});

export type AccountView = z.infer<typeof AccountViewSchema>;

/** Account summary payload (`POST /auth/register`, `POST /admin/users`). */
export class AccountViewDto extends createZodDto(AccountViewSchema) {}

export function toAccountView(
  user: UserRecord,
  displayName: string,
  serverDomain: string,
): AccountView {
  return {
    id: user.id,
    identifier: user.name ? userIdentifier(user.name, serverDomain) : null,
    email: user.email,
    displayName,
    isOwner: user.isOwner,
    emailVerified: user.emailVerifiedAt !== null,
    status: user.status,
  };
}
