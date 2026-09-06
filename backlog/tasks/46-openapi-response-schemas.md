# backend — OpenAPI: response schemas and view refactor

**Status**: done
**Type**: backend
**Issue**: [#46](https://github.com/marmotz/ekoz/issues/46)

Reference: [server-openapi-doc technical design §2](../features/server-openapi-doc/technical.md),
[entity identifier format](../../docs/technical/entity-identifier-format.md).

## Verified findings

- Responses have no schema: controllers return object literals or `*.view.ts` output, typed by hand-written interfaces (`src/modules/identity/auth/session.view.ts` `SessionView`, `src/modules/identity/accounts/account.view.ts`). `stream.controller.ts` inlines `Promise<{ ticket: string; expiresIn: number }>`.
- `entity-identifier-format.md` requires entity ids typed as a 26-char base32 pattern, not `format: uuid`.

## To do

1. For each in-scope endpoint, add a response Zod schema next to its request DTO (`LoginResponseSchema`, `SessionViewSchema`, `AccountViewSchema`, `TicketResponseSchema`, `DiscoveryDocumentSchema`, ...). Entity id fields use a shared `entityIdSchema` (`z.string().regex(...)` with the base32 pattern).
2. Re-type the `*.view.ts` helpers to return `z.infer<typeof XxxSchema>`; delete the hand-written interfaces. Do the same for the inline type in `stream.controller.ts`.
3. Add `@ApiResponse({ status, type: XxxResponseDto })` for the success case and the error-response decorator (from the shared task) for reachable error codes on every in-scope route.
4. Verify `SwaggerModule.createDocument` output: every in-scope path has a typed request and response, entity ids are the base32 pattern, `$ref` reuse for shared schemas.
5. Full `apps/server` test + e2e run.
6. `apps/server/CHANGELOG.md` `## [Unreleased]` → `Changed` if any response payload shape is corrected during the audit.

## Dependencies

- [44-openapi-problem-details-dto](44-openapi-problem-details-dto.md)
- [45-openapi-request-dtos](45-openapi-request-dtos.md)
