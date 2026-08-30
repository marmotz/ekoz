# AGENTS.md — `spec/backlog`

Scope: only tasks whose deliverable is in this repository (protocol spec,
cross-cutting docs). Server / SDK / client tasks live in those repositories'
backlogs.

## Conventions

- Everything in **English**. The `backlog-*` skills use French field names in
  their templates; use the English equivalents:

  | skill template | use here |
  |----------------|----------|
  | `**Statut**` / values `à faire` / `en cours` / `fait` | `**Status**` / `todo` / `in progress` / `done` |
  | `## Constat vérifié` | `## Verified findings` |
  | `## À faire` | `## To do` |
  | `## Dépendances` | `## Dependencies` |
  | `## Découpage en tâches d'implémentation` | `## Implementation task breakdown` |
  | `Pas encore créées.` | `Not created yet.` |
  | todo columns `Fait` / `Issue` / `Tâche` / `Description` | `Done` / `Issue` / `Task` / `Description` |

- Task files: `tasks/xxx-<kebab-title>.md` until the GitHub issue exists, then
  rename `xxx` to the real issue number.
- Issues are created in `ekoz-chat/spec`.
- Cross-repo dependencies use the qualified form `Depends on ekoz-chat/server#N`
  (never a bare `#N`, which would be read as a `spec` issue and would misfire the
  `implement-issue` guard).
