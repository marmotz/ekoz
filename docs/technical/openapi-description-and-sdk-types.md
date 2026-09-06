# OpenAPI description and SDK types

## Context

The reference server ([`apps/server`](../../apps/server), NestJS 12) exposes the
HTTP API that [`@ekozhq/sdk`](../../packages/sdk), the admin console and the
demonstration web client consume. Until now that surface had no machine-readable
description: routes were documented only by prose in [`docs/`](../) and by
hand-written SDK bindings.

Two facts about the server shape the solution:

- **Validation is Zod v4, not `class-validator`.** Request bodies are plain Zod
  schemas in `*.dto.ts` files, applied by a hand-written
  [`ZodValidationPipe`](../../apps/server/src/core/http/zod-validation.pipe.ts).
  There are no DTO classes for `@nestjs/swagger` to introspect.
- **Responses had no schema.** Controllers returned object literals or the
  output of `*.view.ts` helpers, typed only by a hand-written `interface`.

## Decision

Derive an OpenAPI 3 description from the code, serve it live, and commit a
generated `openapi.json` that CI keeps honest.

### Zod → OpenAPI bridge: `nestjs-zod`

`class LoginDto extends createZodDto(LoginSchema)` produces a real class that
`@nestjs/swagger` accepts as `type:` and that carries the Zod schema.
`nestjs-zod@5` teaches the schema factory to emit JSON Schema from it with named
`components/schemas` entries and `$ref` reuse — no explicit
`patchNestJsSwagger()` call is needed in v5 — and `cleanupOpenApiDoc` strips the
intermediate artefacts.

The same `createZodDto` class is passed to `ZodValidationPipe`, which unwraps it
to its `.schema`, so a route carries **one** DTO for both runtime validation and
the OpenAPI body. `*.view.ts` helpers now return `z.infer<typeof XxxSchema>` and
the hand-written response `interface`s are gone.

**Version note.** `nestjs-zod@5.5.0` lists peers `@nestjs/common: ^10 || ^11` and
`@nestjs/swagger: ^7 || ^8 || ^11`; the server runs Nest 12 + `@nestjs/swagger@12`.
A spike (build a document for one `createZodDto` controller, inspect the output)
confirmed the pair works: request bodies, typed responses and `$ref` component
reuse all emit correctly. The peer range is stale, not a real incompatibility, so
the `nestjs-zod` path was kept rather than the manual `z.toJSONSchema` fallback.

**Alternatives considered**

| Option | Why not |
| ------ | ------- |
| Manual `@ApiBody({ schema: z.toJSONSchema(S) })` per route | Zod v4 ships `z.toJSONSchema`, but every route repeats the call, schemas inline with no `$ref` reuse, no shared component registry. More boilerplate, worse spec for codegen. |
| Switch DTOs to `class-validator` + the swagger CLI plugin | Rewrites every schema, loses the `z.infer` inward typing the pipe and `api-conventions.md` rely on. |
| `@asteasolutions/zod-to-openapi` with a hand-built registry | Re-implements what `nestjs-zod` already does for Nest. |

### Errors, identifiers, security

- One shared [`ProblemDetailsDto`](../../apps/server/src/core/http/problem-details.dto.ts)
  from a Zod schema, and an
  [`@ApiProblemResponses()`](../../apps/server/src/core/http/api-problem-responses.decorator.ts)
  decorator that declares the `application/problem+json` responses a route can
  return (`401` by default, `422` on request). See
  [HTTP API conventions](api-conventions.md).
- Entity id fields use a shared `entityIdSchema` — a 26-char Crockford base32
  pattern, never `format: uuid`. See
  [entity identifier format](entity-identifier-format.md).
- A global `bearer` HTTP-JWT security scheme; `@Public()` routes carry no
  requirement.

### Exposure and the committed artefact

- `SwaggerModule.setup('docs', …, { jsonDocumentUrl: 'docs/json' })` in
  [`main.ts`](../../apps/server/src/main.ts) — UI at `/docs`, JSON at
  `/docs/json`, in every environment. The API targets third-party clients and
  peer servers, so the spec is public by design, like `GET /.well-known/ekoz`.
- `bun run openapi:emit` ([`src/openapi/emit.ts`](../../apps/server/src/openapi/emit.ts))
  builds the document from `AppModule` with `preview: true` — controllers
  without providers, so no database, config load or network — and writes
  `apps/server/openapi.json`. The live endpoint and the file come from the same
  [`buildOpenApiDocument`](../../apps/server/src/openapi/document.ts).
- **Scope**: every route the SDK calls. `health.controller.ts` and
  `metrics.controller.ts` are `@ApiExcludeController()`.

## Consequences

- Response shapes now have a **single schema source** (`*.dto.ts` / `*.view.ts`),
  consumed by kurotako to pre-generate the SDK's request/response types. That
  generation lives in a separate app and is out of scope here; this feature only
  guarantees the spec is complete and exploitable.
- `apps/server/openapi.json` is a committed, generated artefact. A future CI step
  (`tako check`) fails the build when it drifts from the code.
- New `apps/server` dependencies: `@nestjs/swagger`, `nestjs-zod`.
- 9 request-DTO files gained `createZodDto` classes; `ZodValidationPipe` accepts
  a schema or a DTO class. No change to validation behaviour or the `422` /
  `validation_failed` output.
