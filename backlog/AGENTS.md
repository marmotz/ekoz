# AGENTS.md — `spec/backlog`

Repo-specific conventions for the backlog, overriding the generic `backlog-*`
skill conventions.

## Language

Everything in **English** (the project-wide rule). The `backlog-*` skills use
French field names in their templates; use these English equivalents instead:

| skill template | use here |
|----------------|----------|
| `**Statut**` | `**Status**` |
| `**Type**` | `**Type**` |
| `**Repo**` | `**Repo**` |
| `**Issue**` | `**Issue**` |
| `## Constat vérifié` | `## Verified findings` |
| `## À faire` | `## To do` |
| `## Dépendances` | `## Dependencies` |
| `## Découpage en tâches d'implémentation` | `## Implementation task breakdown` |
| status values `à faire` / `en cours` / `fait` | `todo` / `in progress` / `done` |
| `Pas encore créées.` | `Not created yet.` |
| todo.md columns `Fait` / `Issue` / `Tâche` / `Description` | `Done` / `Issue` / `Task` / `Description` |

## Issue hub repositories

Task files live in this repo (`spec/backlog/tasks/`). GitHub issues are created
**in the repository where the code for that task lives**, not in `spec`:

| Task type | Issue repo |
|-----------|-----------|
| server implementation | `ekoz-chat/server` |
| SDK | `ekoz-chat/sdk-js` |
| demo web client | `ekoz-chat/client-web` |
| protocol / spec only | `ekoz-chat/spec` |

Each task file records its `**Repo**` field accordingly. When a task spans
repositories, split it.

## Task file naming

`spec/backlog/tasks/xxx-<kebab-title>.md` until the GitHub issue exists, then
rename `xxx` to the real issue number (issues and PRs share one sequence per
repo, so never guess the number).
