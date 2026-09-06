# server — conversations: room model and hierarchy

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#24](https://github.com/ekoz-chat/server/issues/24)

Reference: [../features/conversations/technical.md §4-§5, §7](../features/conversations/technical.md#4-data-model-prisma-slice),
[ADR 0003](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0003-conversation-data-model.md).

## To do

1. Prisma models: `Room`, `RoomClosure` (§4). `RoomType` / `RoomVisibility` enums.
2. `POST /spaces`, `POST /rooms` (channels), `GET /rooms/:id`,
   `GET /rooms/:id/children`, `PATCH /rooms/:id`, `POST /rooms/:id/move`,
   `DELETE /rooms/:id` (soft, subtree check).
3. Closure maintenance on insert/move; cycle guard; `rooms.max_depth` guard.
4. Register conversations config params (§3).

`room_*` lifecycle events and permission checks are wired in by the event-log
(#25) and permission (#26) tasks, which build on this one — do not add them as
dependencies here (it would create a cycle). This task may land with a
provisional owner-only guard and no event emission.

## Dependencies

- server-core [#2 Prisma setup](2-prisma-setup.md), [#4 config system](4-config-system.md)
- identity [#13 auth guards](13-identity-auth-tokens-and-guards.md)
