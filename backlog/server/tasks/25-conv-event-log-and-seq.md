# server — conversations: per-room event log and seq allocation

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#25](https://github.com/ekoz-chat/server/issues/25)

Reference: [../features/conversations/technical.md §10](../features/conversations/technical.md#10-event-log-and-seq-allocation),
[event log and ordering](../../../docs/technical/event-log-and-ordering.md).

## To do

1. Prisma model: `RoomEvent` (`@@id([roomId, seq])`). `RoomEventType` enum.
2. `seq` allocation inside the caller's transaction:
   `UPDATE room SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq`.
3. `EventLogService.append(tx, { roomId, type, senderId, content })` — the single
   entry point; every state change goes through it.
4. Typed payload schemas per `RoomEventType` (Zod), shared with the protocol doc.
5. `originServer` set to `server.domain` for now.
6. Property tests: monotonic, gap-free `seq` under concurrent appends to the same
   room.

## Dependencies

- [24-conv-room-model-and-hierarchy](24-conv-room-model-and-hierarchy.md) (Room table)
- server-core [#2 Prisma setup](2-prisma-setup.md)
