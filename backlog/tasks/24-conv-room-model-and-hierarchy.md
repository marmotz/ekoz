# server — conversations: room model and hierarchy

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#24](https://github.com/ekoz-chat/server/issues/24)

Reference: [../features/conversations/technical.md §4-§5, §7](../features/conversations/technical.md#4-data-model-prisma-slice),
[ADR 0003](../../docs/technical/adr/0003-conversation-data-model.md).

## To do

1. Prisma models: `Room`, `RoomClosure` (§4). `RoomType` / `RoomVisibility` enums.
2. `POST /spaces`, `POST /rooms` (channels), `GET /rooms/:id`,
   `GET /rooms/:id/children`, `PATCH /rooms/:id`, `POST /rooms/:id/move`,
   `DELETE /rooms/:id` (soft, subtree check).
3. Closure maintenance on insert/move; cycle guard; `rooms.max_depth` guard.
4. Emit `room_created` / `room_updated` / `room_moved` / `room_deleted` events
   (via the event-log task).
5. Register conversations config params (§3).

## Dependencies

- server-core [#2 Prisma setup](2-prisma-setup.md), [#4 config system](4-config-system.md)
- identity [#13 auth guards](13-identity-auth-tokens-and-guards.md)
- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
- [26-conv-permission-model](26-conv-permission-model.md)
