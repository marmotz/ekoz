import { z } from 'zod';

/**
 * A nullable string that renders as `{ type: "string", nullable: true }` in the
 * OpenAPI 3.0 document.
 *
 * Plain `z.string().nullable()` trips a `nestjs-zod` conversion bug that emits
 * `{ type: "array", items: { type: "string" } }` for a top-level DTO property;
 * the explicit `.meta({ type: "string" })` overrides that. String schemas that
 * already carry a format or a pattern (`z.email()`, `z.iso.datetime()`,
 * `entityIdSchema`, ...) convert correctly on their own and do not need this.
 */
export const nullableString = () => z.string().nullable().meta({ type: 'string', nullable: true });

/** Same workaround as {@link nullableString}, for a nullable number field. */
export const nullableNumber = () => z.number().nullable().meta({ type: 'number', nullable: true });
