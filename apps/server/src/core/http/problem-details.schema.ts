import { z } from 'zod';

/**
 * Zod source of truth for the `application/problem+json` body (RFC 9457). The
 * hand-written `ProblemDetails` / `ValidationIssue` interfaces in
 * [`problem-details.ts`](./problem-details.ts) are derived from these schemas
 * (`z.infer`), so the runtime shape, the compile-time type and the OpenAPI
 * component never drift.
 */

export const ValidationIssueSchema = z
  .object({
    path: z.string().describe('Dotted path to the offending field, e.g. `body.email`.'),
    message: z.string().describe('Human-readable message for this issue.'),
  })
  .describe('A single per-field validation issue.');

export const ProblemDetailsSchema = z
  .object({
    type: z
      .string()
      .describe('URI reference identifying the problem type. `about:blank` when unspecified.'),
    title: z.string().describe('Short, human-readable summary, in English.'),
    status: z.number().int().describe('HTTP status code, repeated in the body per RFC 9457.'),
    detail: z.string().describe('Human-readable explanation specific to this occurrence.'),
    code: z.string().describe('Stable machine-readable error code, namespaced by domain.'),
    errors: z
      .array(ValidationIssueSchema)
      .optional()
      .describe('Per-field validation issues, present only for `validation_failed`.'),
    requestId: z
      .string()
      .optional()
      .describe('Correlation id, echoed from / generated for the request.'),
  })
  .describe(
    'RFC 9457 `application/problem+json` body — the single error shape for the REST surface.',
  );
