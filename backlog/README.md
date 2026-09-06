# Backlog

One backlog for the whole monorepo.

```
backlog/
  features/<slug>/overview.md    product scoping (backlog-discuss)
  features/<slug>/technical.md   design grounded in the code (backlog-technical)
  tasks/<issue>-<slug>.md        open unit tasks; file name = GitHub issue number
  tasks/done/<area>-<n>-<slug>.md  completed tasks (no issue)
  todo.md                        delivery order, one section per feature
  AGENTS.md                      conventions the backlog-* skills follow
```

- GitHub issues are created in **`marmotz/ekoz`**. Issues and PRs share one
  number sequence; a task file is renamed to its real issue number once the
  issue exists.
- Global documentation (functional spec, protocol, technical design) lives in
  [`../docs/`](../docs/) and is referenced by repo-relative path.
- The `backlog-*` skills and `implement-issue` run from the repo root.

See [todo.md](todo.md) for status.
