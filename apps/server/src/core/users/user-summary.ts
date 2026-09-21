import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../http/entity-id.schema.js';
import { nullableString } from '../http/nullable.js';

/**
 * The minimum a client needs to show a user next to some content: who they are
 * and how to draw them. `identifier` is the canonical `name/server` (`null`
 * without a username), `avatarUrl` the versioned avatar URL. All three
 * nullable fields are `null` for a deleted account.
 */
export const UserSummarySchema = z.object({
  id: entityIdSchema,
  identifier: nullableString(),
  displayName: nullableString(),
  avatarUrl: nullableString(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;
export class UserSummaryDto extends createZodDto(UserSummarySchema) {}
