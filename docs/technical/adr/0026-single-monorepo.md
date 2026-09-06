# 0026 — Single monorepo for all Ekoz projects

**Status**: accepted (supersedes in part [ADR 0001](0001-repository-layout.md),
refines [ADR 0019](0019-backlog-lives-in-the-implementing-repo.md))

## Context

[ADR 0001](0001-repository-layout.md) chose four separate repositories
(`spec`, `server`, `sdk-js`, `client-web`) for independent lifecycles. In
practice the parts are not independent: the admin console
([server-administration](../../../backlog/server/features/server-administration/overview.md))
needs the server and the SDK in the same change; every client consumes
`@ekozhq/sdk`; a protocol change touches `spec`, the server and the SDK at once.
[ADR 0019](0019-backlog-lives-in-the-implementing-repo.md) already had to walk
back part of 0001 (backlog placement) because cross-repo tooling broke.

Coordinating four repos (linked releases, `npm link` during bring-up, protocol
version bumps, cross-repo PRs) costs more than it buys while the whole project is
pre-1.0 and maintained by one team.

The server had a pending task to become a Bun-workspaces monorepo on its own
(`apps/backend` + `apps/admin`); this ADR generalises that to the whole project.

## Decision

One Git repository, `marmotz/ekoz`, a **Bun workspaces** monorepo.

```
apps/server        @ekozhq/server      (private)  reference server
apps/client-web    @ekozhq/client-web  (private)  demonstration web client
apps/admin         @ekozhq/admin       (private)  admin console
packages/sdk       @ekozhq/sdk         (npm)      protocol SDK
docs/                                             specification, protocol, ADRs
backlog/<area>/                                   backlog, one area per project part
```

- The four original repos were merged with `git subtree` (full history preserved).
- Only `packages/sdk` publishes to npm, under the `@ekozhq` scope, via Changesets
  (`scripts/release-publish.sh`). Apps are deployed, not published.
- Tooling is shared at the root: Biome (format + lint), a `tsconfig.base.json`,
  Vitest projects, lefthook, one CI workflow. `apps/server` keeps a minimal
  ESLint config for the `eslint-plugin-boundaries` rule only.
- The backlog stays "with the code" (the intent of ADR 0019) but "repository"
  becomes "area under `backlog/`": `backlog/server`, `backlog/sdk`,
  `backlog/client-web`, `backlog/spec`, `backlog/monorepo`. Task numbering is
  per area.
- `docs/` (ex-`spec`) is the source of truth for global documentation, now
  referenced by repo-relative path instead of absolute GitHub URL.

## Consequences

- Atomic cross-cutting changes: server endpoint + SDK binding + console screen in
  one PR, one review, one CI run.
- No `npm link`, no inter-repo version pinning during development
  (`workspace:*`).
- The SDK still versions and releases independently (Changesets, its own
  `CHANGELOG.md` and npm cadence).
- Cost: a single issue tracker and history for everything; CI must stay
  selective as the repo grows (per-workspace filters).
- Migration debt tracked in [`backlog/monorepo`](../../../backlog/monorepo/todo.md):
  rewrite `github.com/ekoz-chat/*` links, reconcile ADR 0001 / 0019 text, verify
  the server Docker build, clear inherited Biome warnings.
