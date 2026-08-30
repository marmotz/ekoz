# server — HTTP conventions (problem+json, validation, context, logging)

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#3](https://github.com/ekoz-chat/server/issues/3)

Reference: [../features/server-core/technical.md §10](../features/server-core/technical.md#10-cross-cutting-http-conventions)
and [ADR 0017](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0017-api-conventions.md).

## To do

1. Global exception filter producing `application/problem+json` (RFC 9457):
   `{ type, title, status, detail, code }`. A `DomainError` base class carries a
   stable `code`; validation errors map to `422` + `code = "validation_failed"`
   + an `errors` array.
2. `ZodValidationPipe` validating body/query/params against Zod schemas at the
   edge; inferred types flow inward.
3. Request context via `AsyncLocalStorage`: `requestId` (accept + echo
   `X-Request-Id`), `clientIp`, and a slot for `userId`/`sessionId` (populated
   later by `AuthGuard`).
4. Structured JSON logging (pino): one line per request + explicit domain events;
   redact secrets.
5. `@Public()` decorator + a global guard baseline (allow-all until `AuthGuard`
   lands in identity).
6. Timestamps: UTC, ISO-8601 in payloads.

## Dependencies

- [1-server-skeleton](1-server-skeleton.md)
