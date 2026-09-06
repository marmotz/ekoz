# 0001 — Repository layout

**Status**: accepted (superseded in part by [ADR 0026](0026-single-monorepo.md))

## Context

The project comprises a server, a reusable SDK and a demonstration client. These
parts have different lifecycles, audiences and release cadences. The protocol is
a shared contract that the SDK and federation depend on, independently of the
server implementation.

## Decision

~~Four separate Git repositories, one per domain:~~
→ **Superseded by [ADR 0026]**: the four repos below were merged into one Bun
workspaces monorepo (`marmotz/ekoz`). The domain split survives as workspaces
(`apps/*`, `packages/*`) and `backlog/` areas. Original decision text kept below.

Four separate Git repositories, one per domain:

- `spec`: functional specification, protocol, ADRs. Plus a small backlog for
  spec-only tasks (protocol authoring).
- `server`: reference server, its implementation documentation, **and its
  backlog** — per-feature `overview.md` (product scoping), `technical.md`
  (design) and `tasks/` (one GitHub issue each, in `ekoz-chat/server`).
- `sdk-js`: JavaScript/TypeScript SDK for the protocol (its own backlog when work
  starts).
- `client-web`: React demonstration web client (its own backlog when work
  starts).

No global monorepo. Each code repository documents only its own implementation.
The protocol lives in `spec` and is referenced by version.

**The backlog for a feature lives in the repository that implements it** — see
[ADR 0019](0019-backlog-lives-in-the-implementing-repo.md). `spec` holds only what
is genuinely global (functional spec, protocol, ADRs); it is referenced from the
code repos by absolute URL.

## Consequences

- Independent versioning and releases; the protocol is not tied to the server's
  cycle.
- Cost: cross-repo coordination (protocol versions, linked releases) must be
  tooled. Cross-cutting changes touch several repositories.
- The parent directory contains only these four folders, no files.
