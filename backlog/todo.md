# Backlog — aggregated status

Per-area delivery order and status live in each area's own `todo.md`:

- [server/todo.md](server/todo.md) — reference server (core, identity, conversations, administration).
- [sdk/todo.md](sdk/todo.md) — `@ekozhq/sdk` foundations and resources.
- [client-web/todo.md](client-web/todo.md) — demonstration web client.
- [spec/todo.md](spec/todo.md) — specification and ADRs.
- [monorepo/todo.md](monorepo/todo.md) — repo consolidation follow-ups.

## Current focus

The first product increment is **core + messaging + a minimal admin console**:
identity, basic administration, spaces/rooms/permissions, messages, presence,
retention, local moderation, exercised from the demonstration client.

Cross-area order:

1. `spec` ADRs land before the code that depends on them.
2. `sdk` resources land before the `client-web` / `admin` screens that call them.
3. `server` endpoints land before the `sdk` bindings that wrap them.
