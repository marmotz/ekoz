# backend — OpenAPI: shared problem+json schema and error response decorator

**Status**: done
**Type**: backend
**Issue**: [#44](https://github.com/marmotz/ekoz/issues/44)

Reference: [server-openapi-doc technical design §2](../features/server-openapi-doc/technical.md),
[HTTP API conventions](../../docs/technical/api-conventions.md).

## Verified findings

- `src/core/http/problem-details.ts` defines `ProblemDetails` and `ValidationIssue` as hand-written interfaces; `src/core/http/problem-exception.filter.ts` emits them as `application/problem+json` (RFC 9457).
- Every non-`@Public()` route can return `401`; every route with a `ZodValidationPipe` body can return `422` with `code = "validation_failed"` and an `errors` array.

## To do

1. Add `src/core/http/problem-details.schema.ts`: a Zod schema `ProblemDetailsSchema` (and `ValidationIssueSchema`) matching `problem-details.ts` exactly. Re-type the existing interfaces as `z.infer<...>` and delete the hand-written duplicates, or keep the interface as the single source and derive the schema — pick one, no drift.
2. Expose a `ProblemDetailsDto` via `createZodDto(ProblemDetailsSchema)` (manual-bridge equivalent if that path was taken).
3. Add a decorator helper `src/core/http/api-problem-responses.decorator.ts` that applies `@ApiResponse` for the common error codes (`401` always; `422` when asked) referencing `ProblemDetailsDto`, so controllers only declare the extra codes they add.
4. Register the `content` type as `application/problem+json` on those responses.
5. Unit test the schema round-trips a representative filter output.
6. `apps/server/CHANGELOG.md` `## [Unreleased]` if `src/` shape changes are user-visible (schema export only — likely no entry needed; judge at implementation).

## Dependencies

- [43-openapi-swagger-bootstrap](43-openapi-swagger-bootstrap.md)
