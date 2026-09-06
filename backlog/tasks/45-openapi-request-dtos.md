# backend — OpenAPI: convert request DTOs to Zod DTO classes

**Status**: done
**Type**: backend
**Issue**: [#45](https://github.com/marmotz/ekoz/issues/45)

Reference: [server-openapi-doc technical design §2](../features/server-openapi-doc/technical.md).

## Verified findings

- 9 DTO files, all bare `z.object` exports: `src/modules/identity/` →
  `auth/auth.dto.ts`, `accounts/{lifecycle,password-reset,registration,setup,username}.dto.ts`,
  `email-verification/email-verification.dto.ts`, `invitations/invitation.dto.ts`, `profile/profile.dto.ts`.
- `src/core/http/zod-validation.pipe.ts` takes a `ZodType<T>` and is used as `@Body(new ZodValidationPipe(LoginSchema))`.
- `createZodDto(schema)` classes expose the schema (`.schema` / `.zodSchema` depending on version) — the pipe can accept either.

## To do

1. For each DTO file, add a `createZodDto` class per request schema (keep the raw schema export; the service layer and `z.infer` types stay unchanged).
2. Update `ZodValidationPipe` to accept a `ZodType` or a `createZodDto` class (unwrap to the schema). Keep validation behaviour and the `422` / `validation_failed` output identical; extend `zod-validation.pipe.spec.ts`.
3. On each in-scope controller route with a body, add `@ApiBody({ type: XxxDto })` and `@ApiOperation` summary. In-scope controllers: `auth`, `sessions`, `stream`, `accounts/{registration,setup,lifecycle,password-reset,username}`, `email-verification`, `invitations`, `profile`, `discovery`, `storage/blob`.
4. Mark `@Public()` routes with no security requirement; leave the rest under the global `bearer` scheme. Document the SSE ticket query parameter on `GET /events` only.
5. Run `bun run --filter '@ekozhq/server' test` and the e2e suite.

## Dependencies

- [43-openapi-swagger-bootstrap](43-openapi-swagger-bootstrap.md)
