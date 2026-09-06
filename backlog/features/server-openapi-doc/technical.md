# Server OpenAPI documentation — technical design

**Status**: draft · feature [overview.md](overview.md)

## Current state of the code

- **No `@nestjs/swagger` anywhere.** `apps/server/package.json` has no OpenAPI
  dependency; `grep -rn "swagger" apps/server/src` is empty. The bootstrap
  ([`src/main.ts`](../../../apps/server/src/main.ts)) creates the app, runs
  `app.init()`, then `app.listen()` — no document generation.
- **Validation is Zod v4, not class-validator.** Request bodies are plain Zod
  schemas in `*.dto.ts` files, applied through a hand-written pipe
  ([`src/core/http/zod-validation.pipe.ts`](../../../apps/server/src/core/http/zod-validation.pipe.ts)):
  `@Body(new ZodValidationPipe(LoginSchema)) body: LoginBody`. There are no DTO
  classes and no `class-validator` / `class-transformer` metadata for
  `@nestjs/swagger` to introspect.
- **Responses have no schema.** Controllers return ad-hoc object literals or the
  output of `*.view.ts` helpers
  ([`session.view.ts`](../../../apps/server/src/modules/identity/auth/session.view.ts),
  [`account.view.ts`](../../../apps/server/src/modules/identity/accounts/account.view.ts)),
  typed only by a hand-written `interface`. `stream.controller.ts` even inlines
  `Promise<{ ticket: string; expiresIn: number }>`.
- **Errors are RFC 9457 `application/problem+json`**, one shape for the whole
  surface:
  [`src/core/http/problem-details.ts`](../../../apps/server/src/core/http/problem-details.ts)
  (`ProblemDetails`, `ValidationIssue`), emitted by
  [`problem-exception.filter.ts`](../../../apps/server/src/core/http/problem-exception.filter.ts).
  Documented in [`docs/technical/api-conventions.md`](../../../docs/technical/api-conventions.md).
- **Auth**: global `BaselineAuthGuard` (`APP_GUARD` in
  [`http.module.ts`](../../../apps/server/src/core/http/http.module.ts)); routes
  opt out with `@Public()`
  ([`public.decorator.ts`](../../../apps/server/src/core/http/public.decorator.js)).
  Bearer JWT verified by
  [`auth.guard.ts`](../../../apps/server/src/modules/identity/guards/auth.guard.ts).
  The SSE consumer instead takes a one-shot ticket in the query string
  ([`stream.controller.ts`](../../../apps/server/src/modules/identity/auth/stream.controller.ts)).
- **Controllers in scope** (everything the SDK calls — `apps/server/src/modules/**`
  plus `discovery` and `storage/blob` from `core`):
  `auth`, `sessions`, `stream`, `accounts/{registration,setup,lifecycle,password-reset,username}`,
  `email-verification`, `invitations`, `profile`, `discovery` (`GET /.well-known/ekoz`),
  `storage/blob`. **Out of scope**: `health.controller.ts`,
  `observability/metrics.controller.ts` (operational, not SDK).
- **DTO files today**: `auth`, `accounts/{lifecycle,password-reset,registration,setup,username}`,
  `email-verification`, `invitations/invitation`, `profile` — 9 files, all
  bare `z.object` exports.
- **CI**: [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) runs
  `bun run lint`, `lint:boundaries`, `typecheck`, `build`, `test`, `test:server`,
  then a separate `docker` job. No OpenAPI step.
- **kurotako is already wired for another concern**: root `tako.config.ts` +
  `kurotako` / `@kurotako/parser-prisma` / `@kurotako/gen-zod` devDeps
  (`git diff package.json`) generate Zod from the Prisma contract into
  `apps/server/src/generated`. This feature adds an OpenAPI consumer for
  kurotako; it does not own that config.

## Decisions

### 1. Zod → OpenAPI bridge: `nestjs-zod`

`@nestjs/swagger` builds the document from controller decorators plus DTO-class
introspection. With bare Zod schemas it would emit endpoints with empty
request/response bodies. `nestjs-zod` closes the gap:

- `class LoginDto extends createZodDto(LoginSchema)` — a real class
  `@nestjs/swagger` accepts as `type:`, carrying the Zod schema.
- `patchNestJsSwagger()` (called once before `SwaggerModule.createDocument`)
  teaches the schema factory to read that Zod schema and emit JSON Schema, with
  named `components/schemas` entries and `$ref` reuse.
- `cleanupOpenApiDoc(document)` strips the intermediate artefacts from the final
  document.

**Alternatives considered**

| Option | Why not |
| ------ | ------- |
| Manual bridge: `@ApiBody({ schema: z.toJSONSchema(S) })` per route | Zod v4 ships `z.toJSONSchema`, no dependency — but every route repeats the call, inline anonymous schemas (no `$ref` reuse), and nothing shares a component registry unless we build one. Rejected for boilerplate and a worse spec for SDK codegen. |
| Switch DTOs to `class-validator` + `@nestjs/swagger` CLI plugin | Rewrites every schema, loses Zod's `z.infer` inward typing that `api-conventions.md` and the pipe rely on, adds two runtime deps. Rejected. |
| `@asteasolutions/zod-to-openapi` with a hand-built registry | Works, but we would re-implement what `nestjs-zod` already does for Nest. Rejected. |

**Version risk — resolved (#43 spike, kept the `nestjs-zod` path).**
`@nestjs/swagger@12.0.1` matches Nest 12. `nestjs-zod@5.5.0` declares peers
`@nestjs/common: ^10 || ^11` and `@nestjs/swagger: ^7 || ^8 || ^11` — Nest 12 is
not listed. The spike built a document for one `createZodDto` controller on
Nest 12 + `@nestjs/swagger@12` and confirmed request bodies, typed responses and
`$ref` component reuse all emit correctly; `nestjs-zod@5` no longer needs an
explicit `patchNestJsSwagger()` call. The peer range is stale, not a real
incompatibility. The manual `z.toJSONSchema` fallback was therefore not needed.

### 2. Response schemas are in scope — full coverage

`overview.md` fixes the spec as the source of truth for kurotako's SDK type
generation, so response bodies need real schemas. Work:

- For each in-scope endpoint, add a response Zod schema next to its request DTO
  (`*.dto.ts`, e.g. `LoginResponseSchema`, `SessionViewSchema`).
- Re-express the `*.view.ts` helpers and inline return types in terms of those
  schemas: the `view` function's return type becomes `z.infer<typeof
  SessionViewSchema>`, and the hand-written `interface` is deleted. `view`
  functions keep their mapping role; they gain a compile-time tie to the schema.
- Annotate controllers: `@ApiResponse({ status, type: XxxResponseDto })` for the
  success case, `@ApiResponse({ status, type: ProblemDetailsDto })` for error
  cases actually reachable on that route.
- One shared `ProblemDetailsDto` / `ValidationIssueDto` from a Zod schema in
  `src/core/http/`, referenced by a global `@ApiResponse` where practical
  (422 validation, 401 auth) via a decorator helper, so routes only declare the
  extra codes they add.
- Security schemes: register `bearer` (HTTP bearer JWT) globally in the document
  builder; mark `@Public()` routes with `@ApiSecurity({})` / no requirement. The
  SSE ticket query param is documented on its route only.

### 3. Exposure: served in every environment

- `SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' })`
  (or equivalent) in `main.ts` after `app.init()`, before `app.listen()`. No
  environment gate — UI at `/docs`, JSON at `/docs/json` everywhere including
  production. (Rationale: the API is meant for third-party clients and peer
  servers; the spec is public by design, like `GET /.well-known/ekoz`.)
- The document `info` (title, version, description) is filled from
  `package.json` / protocol version constants already in the code
  (`DiscoveryService` exposes supported protocol versions — reuse that source).

### 4. Committed artefact + generation script

- `apps/server/openapi.json` — pretty-printed, committed, regenerated from code.
  JSON (OpenAPI JSON and YAML are information-equivalent; JSON is the default and
  what kurotako consumes).
- New script `apps/server/package.json` → `"openapi:emit"`: a standalone entry
  (`src/openapi/emit.ts`) that builds the Nest application context **without a
  database or network** — `NestFactory.create(AppModule, { ... })` far enough to
  enumerate routes, `patchNestJsSwagger()`, `SwaggerModule.createDocument`,
  `cleanupOpenApiDoc`, write the file, exit. If `AppModule` cannot be
  instantiated offline (Prisma / config side effects in `onModuleInit`), fall
  back to `NestFactory.create(AppModule, { preview: true })` — preview mode
  instantiates controllers without providers, which is enough for
  `createDocument`. Confirm in the spike.
- Root convenience: `package.json` → `"openapi:emit": "bun run --filter '@ekozhq/server' openapi:emit"`.

### 5. CI drift check via `tako check`

- kurotako's `tako check` reports drift between committed generated output and
  what the current sources would produce. Add an `apps/server` OpenAPI source to
  `tako.config.ts` (or a second `defineConfig` output) pointing at
  `apps/server/openapi.json`, so a stale committed spec fails `tako check`.
- `ci.yml` `check` job: add `- run: bun run openapi:emit` then
  `- run: bunx tako check` (or a single `openapi:check` script that does emit +
  `git diff --exit-code apps/server/openapi.json`, whichever kurotako's command
  model favours — decide in the tasking step once `tako check`'s exact contract
  is known).
- lefthook pre-commit: out of scope for now (keep the hook fast); CI is the gate.

### 6. Cross-cutting design page (CONTRIBUTING convention)

Add `docs/technical/openapi-description-and-sdk-types.md`: context (Zod-first
server, no class DTOs), the `nestjs-zod` bridge and why, the
`/docs` + committed `openapi.json` + `tako check` pipeline, and the consequence
that response shapes now have a single schema source. Link it from
`docs/technical/README.md` and cross-reference `api-conventions.md`
(problem+json already appears there) and `entity-identifier-format.md` (which
already forward-references "the OpenAPI description" typing entity ids as a
26-char base32 pattern, not `format: uuid` — the emit step must honour that).

## Consequences

- **9 DTO files converted** from bare `z.object` export to
  `createZodDto` classes; the custom `ZodValidationPipe` keeps working (it takes
  a `ZodType`, and `createZodDto` classes expose `.schema`) — verify and, if
  needed, accept either a schema or a DTO class in the pipe. No behavioural
  change to validation or error output.
- **`*.view.ts` interfaces deleted**, return types derived from schemas. Touches
  `session.view.ts`, `account.view.ts`, and the inline type in
  `stream.controller.ts`.
- **New runtime/dev deps** in `apps/server`: `@nestjs/swagger`, `nestjs-zod`
  (or, on spike failure, no new dep + manual bridge).
- **CHANGELOG**: `apps/server/CHANGELOG.md` `## [Unreleased]` gains an `Added`
  entry ("OpenAPI description at `/docs` and `apps/server/openapi.json`"). No
  changeset — `packages/sdk/src` is untouched here.
- **CI time**: one extra `openapi:emit` (no DB, fast) + `tako check`.
- **kurotako coupling**: CI now depends on `tako check` for two concerns
  (Prisma→Zod and OpenAPI). Acceptable; kurotako is already a hard dependency of
  the build via `postinstall`-adjacent generation.
- **Out of scope, explicitly**: the SDK-side type generation from
  `openapi.json` (kurotako, separate app) and any change under `packages/sdk`.

## Implementation task breakdown

| Issue | Task | Scope |
| ----- | ---- | ----- |
| [#43](https://github.com/marmotz/ekoz/issues/43) | [43-openapi-swagger-bootstrap](../../tasks/43-openapi-swagger-bootstrap.md) | §1, §3 — deps, `nestjs-zod` spike, `SwaggerModule` at `/docs` + `/docs/json` |
| [#44](https://github.com/marmotz/ekoz/issues/44) | [44-openapi-problem-details-dto](../../tasks/44-openapi-problem-details-dto.md) | §2 — shared problem+json schema + error-response decorator |
| [#45](https://github.com/marmotz/ekoz/issues/45) | [45-openapi-request-dtos](../../tasks/45-openapi-request-dtos.md) | §2 — 9 DTO files to `createZodDto`, pipe adaptation, `@ApiBody` |
| [#46](https://github.com/marmotz/ekoz/issues/46) | [46-openapi-response-schemas](../../tasks/46-openapi-response-schemas.md) | §2 — response schemas, `*.view.ts` refactor, `@ApiResponse` |
| [#47](https://github.com/marmotz/ekoz/issues/47) | [47-openapi-emit-script](../../tasks/47-openapi-emit-script.md) | §4 — offline `openapi:emit`, committed `apps/server/openapi.json` |
| [#48](https://github.com/marmotz/ekoz/issues/48) | [48-openapi-ci-drift-check](../../tasks/48-openapi-ci-drift-check.md) | §5 — `tako check` wiring + CI step |
| [#49](https://github.com/marmotz/ekoz/issues/49) | [49-openapi-design-doc-page](../../tasks/49-openapi-design-doc-page.md) | §6 — `docs/technical/openapi-description-and-sdk-types.md` |

Dependency order: 43 → (44, 45) → 46 → 47 → (48, 49).
