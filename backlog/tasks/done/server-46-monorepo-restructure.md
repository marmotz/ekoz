# server — restructure the repo into a Bun workspaces monorepo

**Status**: done
**Type**: chore
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-administration/overview.md](../../features/server-administration/overview.md)
("The admin console is a core application of the reference server and lives in
the server repository (monorepo). This implies restructuring the repo into Bun
workspaces").

Today the whole server (`src/`, `prisma/`, `http/`, build config) sits at the
repo root. The admin console needs to live in the same repo as a separate
deployable app. Move the server into `apps/backend/` and prepare the workspace
layout so `apps/admin/` can be added by the next server-administration increment.

## To do

1. **ADR** in `spec` (`docs/technical/`): one combined design page "Reference server
   monorepo and admin console" — the repo is a Bun workspaces monorepo
   (`apps/backend`, `apps/admin`, shared config in `packages/`), and the admin
   console is a core app of the reference server deployed on its own origin
   (stack, owner-only access, the server additions listed in
   [../features/server-administration/technical.md §9](../../features/server-administration/technical.md#9-adr-to-write-in-spec)).
   Update the ADR index. Note it refines
   [repository layout](../../../docs/technical/architecture.md)
   and relates to
   [web client stack](../../../docs/technical/web-client-stack.md).
   This task does the restructure only; `apps/admin/` itself is a later task.
2. **Move** with `git mv` into `apps/backend/`: `src/`, `prisma/`, `http/`,
   `var/`, `docker/`, `nest-cli.json`, `tsconfig.build.json`, `prisma.config.ts`,
   `vitest.config.ts`, `vitest.setup.ts`, `Dockerfile`.
3. **Root `package.json`**: `"workspaces": ["apps/*", "packages/*"]`, keep it
   `private`. Scripts delegate to the backend workspace
   (`bun run --filter '@ekozhq/backend' <script>`) so existing muscle memory
   (`bun run test`, `typecheck`, `db:*`, `start:dev`) keeps working from the
   root. `prepare` (lefthook) and `postinstall` (prisma) stay at the level that
   still works.
4. **`apps/backend/package.json`**: `@ekozhq/backend`, `private`, `type:
module`, its own `dependencies`/`devDependencies` (moved from root),
   `engines`, and the real script bodies (`start`, `start:dev`, `build`, `lint`,
   `test`, `test:unit`, `test:integration`, `db:*`, `format`).
5. **`packages/tsconfig/`**: extract the shared compiler base; `apps/backend`
   extends it. Root `tsconfig.json` becomes a solution file with `references`.
6. **Adapt config paths**:
   - `prisma.config.ts`: `.env` and schema/migrations paths relative to
     `apps/backend/`.
   - `eslint.config.mjs`: move to root, scope globs per workspace (or one
     flat-config file per app).
   - `lefthook.yml`: command globs and `root:` per workspace.
   - `.github/workflows/ci.yml`: run install at root, then the backend
     workspace's `typecheck` / `lint` / `test`; the CHANGELOG check path;
     the `http/` layout check path. Check `viktor-deep.yml` too.
   - `compose.yaml` / `compose.override.yaml`: `build.context` and volume mounts
     to `apps/backend/`.
   - `docker/entrypoint.sh` and `Dockerfile`: `WORKDIR`, copy paths, workspace
     install (`bun install` at root then run the backend), entrypoint path.
7. **CHANGELOG.md**: entry under `## [Unreleased]`.
8. **Verify**: `bun install` clean; from the root `bun run typecheck`,
   `bun run lint`, `bun run test` all green; `docker build` succeeds; one
   `http/` Hurl smoke request passes against a locally running server. Paste the
   passing output in the PR.

## Out of scope

- Creating `apps/admin/` itself (that is the next server-administration increment).
- Any change to server behaviour, endpoints or the DB schema.

## Dependencies

- None (pure restructure; do it before the other server-administration tasks).
