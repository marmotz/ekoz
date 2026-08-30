# 0019 — The backlog lives in the implementing repository

**Status**: accepted (refines [ADR 0001](0001-repository-layout.md))

## Context

[ADR 0001](0001-repository-layout.md) put the whole backlog in `spec`. In
practice that broke the tooling: `implement-issue` and the `backlog-*` skills
operate on a single repository (the current directory), but the backlog and the
technical designs were in `spec` while the code goes in `server`. Running from
`server` could not see `../spec/backlog`; running from `spec` would branch and
write code in the wrong repo; the GitHub issue bodies referenced design docs by
relative links that resolved nowhere.

The move was made before any application code was written.

## Decision

The backlog for a feature lives in the repository that implements it.

- `server/backlog/` holds every server feature's `overview.md` (product scoping),
  `technical.md` (design grounded in this repo's code) and `tasks/` (one GitHub
  issue each, created in `ekoz-chat/server`). `todo.md` gives the delivery order.
- `sdk-js` and `client-web` get their own `backlog/` when work starts there.
- `spec` keeps only a small `backlog/` for spec-only deliverables (protocol
  authoring), with issues in `ekoz-chat/spec`.
- `spec` remains the source of truth for the **global** docs — functional
  specification, protocol, ADRs — referenced from the code repos by absolute
  URL (`https://github.com/ekoz-chat/spec/blob/main/...`).
- GitHub issue bodies must be **self-contained**: task content inline, design and
  ADR links as absolute URLs, dependencies as `Depends on #N` lines (the
  `implement-issue` skill blocks on open dependencies by scanning for that
  pattern).

## Consequences

- `backlog-*` and `implement-issue` run entirely within one repo, with the
  design docs next to the code.
- Cross-repo references (code repo → ADR) are absolute URLs, not relative paths.
- A feature that spans repos (e.g. a protocol change) is split: the server task
  in `server/backlog`, the protocol task in `spec/backlog`, cross-linked.
- `spec/docs/functional/specification.md` points to the server backlog for
  per-feature detail instead of hosting it.
