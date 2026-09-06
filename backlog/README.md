# Backlog

One backlog for the whole monorepo, split by area. Each area keeps the structure
the `backlog-*` skills expect (`features/<slug>/{overview,technical}.md`,
`tasks/<n>-<slug>.md`, `todo.md`).

| Area                          | Scope                                        |
| ----------------------------- | ------------------------------------------- |
| [`server/`](server/)          | Reference server (`apps/server`).            |
| [`sdk/`](sdk/)                 | `@ekozhq/sdk` (`packages/sdk`).              |
| [`client-web/`](client-web/)  | Demonstration web client (`apps/client-web`). |
| [`spec/`](spec/)              | Specification and ADRs (`docs/`).            |
| [`monorepo/`](monorepo/)      | Cross-cutting repo/tooling work.             |

Task numbering is per area and was preserved from the original repositories, so
`server/tasks/12` and `sdk/tasks/12` are unrelated. Links to
`github.com/ekoz-chat/*` in the older task files are historical — those repos
were consolidated here (see [monorepo/](monorepo/) and
[ADR 0026](../docs/technical/adr/0026-single-monorepo.md)).

See [todo.md](todo.md) for the aggregated status.
