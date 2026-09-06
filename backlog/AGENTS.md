# AGENTS.md — `backlog/`

One backlog for the whole monorepo. Product scoping (`overview.md`), technical
design (`technical.md`) and implementation tasks (`tasks/`). Run the `backlog-*`
skills and `implement-issue` **from the repo root**.

Global documentation — functional specification, protocol, technical design —
lives in [`../docs/`](../docs/) and is referenced by **repo-relative path**
(`../../docs/technical/<page>.md` from a task file).

## Structure

- `features/<slug>/overview.md` — product scoping (via `backlog-discuss`).
- `features/<slug>/technical.md` — design grounded in the code (via `backlog-technical`).
- `tasks/<issue>-<slug>.md` — open unit tasks; the file name is the **GitHub
  issue number** (issues and PRs share one sequence in `marmotz/ekoz`).
- `tasks/done/<area>-<n>-<slug>.md` — completed tasks, `**Status**: done`, no
  issue. Kept for reference; not scanned by `backlog-next`.
- `todo.md` — one section per feature, delivery order, all areas.
- GitHub issues are created in **`marmotz/ekoz`**.

## Conventions

Everything in **English**. The `backlog-*` skills use French field names in
their templates; use the English equivalents:

| skill template | use here |
| -------------- | -------- |
| `**Statut**` / `à faire` / `en cours` / `fait` | `**Status**` / `todo` / `in progress` / `done` |
| `## Constat vérifié` | `## Verified findings` |
| `## À faire` | `## To do` |
| `## Dépendances` | `## Dependencies` |
| `## Découpage en tâches d'implémentation` | `## Implementation task breakdown` |
| `Pas encore créées.` | `Not created yet.` |
| todo columns `Fait` / `Issue` / `Tâche` / `Description` | `Done` / `Issue` / `Task` / `Description` |

## Task file / issue body rules

- Task file naming: `tasks/xxx-<kebab-title>.md` until the issue exists, then
  rename `xxx` → the real issue number.
- Links **inside the repo** stay relative in the task file
  (`../features/<slug>/technical.md`, `../../docs/technical/<page>.md`, sibling
  `NN-slug.md`, `done/<area>-N-slug.md`).
- The **GitHub issue body must be self-contained**: it repeats the task content
  and links repo files by **absolute URL**
  (`https://github.com/marmotz/ekoz/blob/develop/...`). Dependencies are stated
  as `Depends on #N` lines — the `implement-issue` skill blocks on open
  dependencies by scanning for that exact pattern.
- A task whose code change lands in a specific workspace notes it in the body;
  the issue still lives in `marmotz/ekoz`.

## Design decisions

Design decisions are written up as prose pages under
[`../docs/technical/`](../docs/technical/) (context, alternatives, consequences),
not as ADRs. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Changelog discipline
is also there.
