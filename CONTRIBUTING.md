# Contributing

## Conventions

- **English everywhere** in code and repo content: directories, files,
  identifiers, comments, commit messages, API messages. UI text goes through i18n
  catalogues (French + English).
- Tests are part of every change (create / update / delete). Nothing is "done"
  until its tests are written and green.
- Formatting + linting: **Biome**, one `biome.json` at the root
  (`bun run lint`, `bun run format`).

## Where design decisions live

Significant design decisions — a data model, a protocol rule, a security
mechanism, a cross-cutting convention — are written as prose pages under
[`docs/technical/`](docs/technical/), each with its context, the alternatives
weighed and the consequences. Update the relevant page in the same change; add a
new page when a decision has no home yet, and link it from
[`docs/technical/README.md`](docs/technical/README.md) and, if it is
structural, from [`docs/technical/architecture.md`](docs/technical/architecture.md).

Protocol behaviour is specified in [`docs/protocol/`](docs/protocol/) and
versioned independently (`docs/protocol/CHANGELOG.md`).

Feature-local implementation choices (table shapes, internal services) stay in
that feature's `backlog/features/<slug>/technical.md`, not in `docs/technical/`.

## Changelog discipline

- **One `CHANGELOG.md` per publishable unit** (`packages/sdk`, each `apps/*`),
  [_Keep a Changelog_](https://keepachangelog.com) format, SemVer. A
  `## [Unreleased]` section is always at the top, with `Added` / `Changed` /
  `Fixed` / `Deprecated` / `Removed` / `Security` categories.
- Any change that touches a workspace's `src/` adds an entry under its
  `## [Unreleased]`. For `apps/docs`, the content directories `docs/` and `sdk/`
  count as `src/`.
- `packages/sdk` versioning and npm publication go through **Changesets**
  (`bunx changeset` from the repo root); its `CHANGELOG.md` is generated, not
  hand-edited.

### Changelog entry style

Record **what changed**, not why. One bullet per user-visible change, **one
line** (two at most), tagged with its issue (`(#42)`).

- No paragraphs, no version pins (those live in `package.json`).
- **No parenthetical dump of identifiers, config keys, defaults or file names.**
  Name the capability, not its internals.
- If you need "and" more than once, split into that many bullets or cut the
  detail.

Rationale, trade-offs and "a doc page is owed" go in the `docs/technical/` page
and the PR body, never the changelog. The only caveats that belong in a
`### Notes` block are ones a _consumer_ must act on right now.

## Licensing

Apache-2.0 for the whole repository. Source files carry an
`SPDX-License-Identifier: Apache-2.0` header; `LICENSE` and `NOTICE` are at the
root. Contributions are accepted under the same license; no CLA.

## Backlog and issues

The backlog lives in [`backlog/`](backlog/); GitHub issues are created in
`marmotz/ekoz`. See [`backlog/AGENTS.md`](backlog/AGENTS.md) for the task-file
and issue conventions.
