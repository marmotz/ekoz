# monorepo — verify the server Docker build

**Status**: done
**Type**: chore
**Issue**: [#41](https://github.com/marmotz/ekoz/issues/41)
`apps/server/Dockerfile` was rewritten for a monorepo build context (repo root)
but not yet built/run end to end.

## To do

1. `docker build -f apps/server/Dockerfile -t ekoz-server .` from the repo root.
2. Fix the multi-stage `COPY` paths if the build fails (hoisted vs per-workspace
   `node_modules`, the `tsconfig.base.json` the server tsconfig extends, the
   `prisma.config.ts` relative paths under `/app/apps/server`).
3. `docker compose -f apps/server/compose.yaml up -d` for Postgres + Mailpit,
   run the container against it, and pass one `apps/server/http/*.hurl` smoke
   request.
4. Update `.github/workflows/ci.yml` to run the docker build.

## Done when

The image builds and boots, `/readyz` returns 200, one Hurl request passes.
