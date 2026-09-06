# AGENTS.md — `server/backlog`

The backlog for the reference server: product scoping (`overview.md`), technical
design (`technical.md`) and implementation tasks (`tasks/`). Run the `backlog-*`
skills and `implement-issue` **from this repository** (`server/`).

Global documentation — functional specification, protocol, architecture decision
records — lives in the sibling [`spec`](https://github.com/ekoz-chat/spec)
repository and is referenced by **absolute URL**, never by a `../../` path that
escapes this repo.

External doc roots (use these prefixes when linking):

| Doc                | URL prefix                                                        |
| ------------------ | ----------------------------------------------------------------- |
| ADRs               | `https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/` |
| Architecture / POC | `https://github.com/ekoz-chat/spec/blob/main/docs/technical/`     |
| Protocol           | `https://github.com/ekoz-chat/spec/blob/main/docs/protocol/`      |
| Functional spec    | `https://github.com/ekoz-chat/spec/blob/main/docs/functional/`    |

## Structure

- `features/<slug>/overview.md` — product scoping (via `backlog-discuss`).
- `features/<slug>/technical.md` — technical design grounded in this repo's code
  (via `backlog-technical`).
- `tasks/<issue-number>-<slug>.md` — unit tasks (via `backlog-tasks`).
- `todo.md` — one table per feature, delivery order.
- GitHub issues are created in **`ekoz-chat/server`** (the current repo).

## Conventions

Everything in **English**. The `backlog-*` skills use French field names in
their templates; use the English equivalents:

| skill template                                          | use here                                       |
| ------------------------------------------------------- | ---------------------------------------------- |
| `**Statut**` / `à faire` / `en cours` / `fait`          | `**Status**` / `todo` / `in progress` / `done` |
| `## Constat vérifié`                                    | `## Verified findings`                         |
| `## À faire`                                            | `## To do`                                     |
| `## Dépendances`                                        | `## Dependencies`                              |
| `## Découpage en tâches d'implémentation`               | `## Implementation task breakdown`             |
| `Pas encore créées.`                                    | `Not created yet.`                             |
| todo columns `Fait` / `Issue` / `Tâche` / `Description` | `Done` / `Issue` / `Task` / `Description`      |

## Task file / issue body rules

- Task file naming: `tasks/xxx-<kebab-title>.md` until the issue exists, then
  rename `xxx` → real issue number (issues and PRs share one sequence).
- The **issue body must be self-contained**: it repeats the task file content,
  links design docs and ADRs by **absolute URL**, and states dependencies as
  `Depends on #N` lines (the `implement-issue` skill blocks on open dependencies
  by scanning for that exact pattern).
- A task whose deliverable is in another repo carries a `**Repo**:` field and its
  issue is created there; it is still tracked here for the delivery order.

## Every decision → an ADR

Any design decision or notable change gets an ADR in the `spec` repo
(`docs/technical/adr/`), per
[ADR 0015](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0015-decisions-are-recorded-as-adrs.md).

## CHANGELOG entries

See **CHANGELOG entries** in the repo-root `AGENTS.md`.
