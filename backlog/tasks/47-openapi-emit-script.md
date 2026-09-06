# backend — OpenAPI: offline emit script and committed openapi.json

**Status**: done
**Type**: backend
**Issue**: [#47](https://github.com/marmotz/ekoz/issues/47)

Reference: [server-openapi-doc technical design §4](../features/server-openapi-doc/technical.md).

## Verified findings

- `apps/server/src/main.ts` runs `app.init()` which triggers every module's `onModuleInit` (config load, Prisma). A generation script must avoid DB and network.
- `NestFactory.create(AppModule, { preview: true })` instantiates controllers without providers — enough for `SwaggerModule.createDocument`.
- Root `tako.config.ts` + `kurotako` devDeps already exist for the Prisma→Zod generation.

## To do

1. Add `src/openapi/emit.ts`: build the Nest app context offline (`preview: true`, fall back only if `createDocument` needs more), `patchNestJsSwagger()`, `SwaggerModule.createDocument`, `cleanupOpenApiDoc`, write pretty-printed JSON to `apps/server/openapi.json`, exit 0.
2. `apps/server/package.json` → `"openapi:emit": "bun run src/openapi/emit.ts"`.
3. Root `package.json` → `"openapi:emit": "bun run --filter '@ekozhq/server' openapi:emit"`.
4. Generate and commit `apps/server/openapi.json`.
5. Test: run `openapi:emit` in CI-like conditions (no Postgres running) and assert it produces a valid OpenAPI 3.x document with the in-scope paths.
6. `apps/server/CHANGELOG.md` `## [Unreleased]` → `Added`: committed `openapi.json` and `openapi:emit` script.

## Dependencies

- [46-openapi-response-schemas](46-openapi-response-schemas.md)
