# CI — OpenAPI: drift check via tako check

**Status**: todo
**Type**: CI
**Issue**: [#48](https://github.com/marmotz/ekoz/issues/48)

Reference: [server-openapi-doc technical design §5](../features/server-openapi-doc/technical.md).

## Verified findings

- `.github/workflows/ci.yml` `check` job runs `lint`, `lint:boundaries`, `typecheck`, `build`, `test`, `test:server`. No OpenAPI step.
- `tako.config.ts` currently declares one source (Prisma) and one output dir (`apps/server/src/generated`).
- kurotako ships `tako check` for drift between committed generated output and current sources — confirm its exact contract (exit code, whether it regenerates) at implementation.

## To do

1. Register `apps/server/openapi.json` as a kurotako-tracked artefact (extend `tako.config.ts` or add a second output), so `tako check` fails when it is stale.
2. Add a root script — `"openapi:check"` — that runs `openapi:emit` then `git diff --exit-code apps/server/openapi.json` (or delegates to `tako check`, whichever matches kurotako's model).
3. `ci.yml` `check` job: add the OpenAPI check step after `build`. It needs no Postgres.
4. Confirm the step fails on a deliberately stale `openapi.json` and passes when in sync.

## Dependencies

- [47-openapi-emit-script](47-openapi-emit-script.md)
