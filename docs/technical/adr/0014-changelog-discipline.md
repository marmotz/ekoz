# 0014 — Changelog discipline

**Status**: accepted

## Context

The author wants, from the start, a changelog per published version, filled
automatically as implementation progresses, in every repository.

## Decision

- **One `CHANGELOG.md` per repository**, *Keep a Changelog* format, **SemVer**
  versioning. A `## [Unreleased]` section always at the top, categories `Added` /
  `Changed` / `Fixed` / `Deprecated` / `Removed` / `Security`.
- **Definition of Done** (in each repository's `AGENTS.md`): any task that
  touches `src/` adds an entry under `Unreleased`.
- **CI check**: fails if the diff touches `src/` without touching `CHANGELOG.md`.
- On release, `Unreleased` becomes a dated versioned block.
- **`sdk-js`**: *Changesets* tool (generates changelog + bump + npm publish).
- **Protocol**: `spec/docs/protocol/CHANGELOG.md`, versioned with SemVer
  independently of the server.

## Consequences

- The changelog is a mandatory output of every task, not a release chore.
- The `backlog-*` skills (`implement-issue`, `backlog-done`) carry this
  obligation.
