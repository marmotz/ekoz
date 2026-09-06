# backend — OpenAPI: swagger bootstrap and Zod bridge

**Status**: done
**Type**: backend
**Issue**: [#43](https://github.com/marmotz/ekoz/issues/43)

Reference: [server-openapi-doc technical design §1, §3](../features/server-openapi-doc/technical.md),
[HTTP API conventions](../../docs/technical/api-conventions.md).

## Verified findings

- No `@nestjs/swagger` in `apps/server/package.json`; `grep -rn swagger apps/server/src` is empty.
- `apps/server/src/main.ts` creates the app, runs `app.init()`, then `app.listen()` — no document step.
- `@nestjs/swagger@12.0.1` matches Nest 12. `nestjs-zod@5.5.0` peers list `@nestjs/common ^10||^11` and `@nestjs/swagger ^7||^8||^11` — Nest 12 not listed, so compatibility must be proven before committing to it.
- Global auth is `BaselineAuthGuard` (`APP_GUARD` in `src/core/http/http.module.ts`); routes opt out with `@Public()` (`src/core/http/public.decorator.ts`). Bearer JWT verified in `src/modules/identity/guards/auth.guard.ts`.
- `DiscoveryService` (`src/core/discovery/discovery.service.ts`) already exposes supported protocol versions — reuse as the document version source.

## To do

1. Add `@nestjs/swagger` and `nestjs-zod` to `apps/server` dependencies. Install and check for peer-dependency breakage against Nest 12.
2. Spike: call `patchNestJsSwagger()`, build a `SwaggerModule.createDocument` for one module (e.g. `AuthController` with one `createZodDto` DTO), inspect the output has a real request schema in `components/schemas`.
3. If `nestjs-zod` does not work on Nest 12 + `@nestjs/swagger@12`: fall back to a manual bridge — a small shared registry calling `z.toJSONSchema()` (Zod v4 native) and `@ApiBody`/`@ApiResponse({ schema })`. Record the outcome in the technical design's §1 version-risk note.
4. Wire the document in `src/main.ts` after `app.init()`, before `app.listen()`:
   - `patchNestJsSwagger()` once at startup (only on the `nestjs-zod` path).
   - `DocumentBuilder`: title, description, version from `package.json` + protocol version constants; `addBearerAuth()` registering a `bearer` HTTP JWT scheme.
   - `cleanupOpenApiDoc(document)` before setup.
   - `SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' })` — served in every environment, no gate.
5. Add an e2e assertion (`http-conventions.e2e-spec.ts` style) that `GET /docs/json` returns 200 with `openapi: "3.x"` and lists at least the `/auth/login` path.
6. `apps/server/CHANGELOG.md` `## [Unreleased]` → `Added`: OpenAPI description served at `/docs` and `/docs/json`.

## Dependencies

None.
