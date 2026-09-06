import type { z } from 'zod';
import type { ProblemDetailsSchema, ValidationIssueSchema } from './problem-details.schema.js';

/**
 * `application/problem+json` body (RFC 9457), the single error shape for the
 * whole REST surface (ADR 0017, technical.md §10).
 *
 * `code` is the stable, machine-readable string the SDK surfaces as a typed
 * error; it is namespaced by domain (e.g. `identity.username_taken`).
 *
 * The shape is defined once as a Zod schema in
 * [`problem-details.schema.ts`](./problem-details.schema.ts); this type is its
 * `z.infer`, and `ProblemDetailsDto` (in `problem-details.dto.ts`) exposes it to
 * `@nestjs/swagger`.
 */
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';
