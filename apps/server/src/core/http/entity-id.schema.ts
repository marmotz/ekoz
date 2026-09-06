import { z } from 'zod';

/**
 * A generated entity id: 26-character Crockford base32 (ULID), no `-`, no
 * ambiguous `I`/`L`/`O`/`U` — see
 * [`docs/technical/entity-identifier-format.md`](../../../../../docs/technical/entity-identifier-format.md).
 *
 * The OpenAPI description types entity ids with this pattern, never
 * `format: uuid`.
 */
export const entityIdSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Must be a 26-character Crockford base32 identifier')
  .describe('Crockford base32 entity identifier (ULID), 26 characters');
