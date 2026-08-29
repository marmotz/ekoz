# server — conversations: retention policies and worker

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#35](https://github.com/ekoz-chat/server/issues/35)

Reference: [../features/conversations/technical.md §13](../features/conversations/technical.md#13-retention),
[ADR 0012](../../docs/technical/adr/0012-retention-and-tombstones.md).

## To do

1. Retention rule shape (`keep` / `hide` / `delete` + `after`), `retention.default`
   config, `Room.retention` (`inherit` sentinel).
2. Effective-rule resolver: room → nearest ancestor space → server default.
3. `PUT /rooms/:id/retention` / `GET …` — needs `room.manage_retention`, emit
   `retention_changed`.
4. Retention worker (interval configurable, default 15 min), batched, idempotent,
   bounded per run:
   - `hide` → set `hiddenAt`, emit `message_hidden` (terminal, no un-hide);
   - `delete` → tombstone `message_created`, clear `body`, dereference
     attachments, emit `message_redacted { reason: "retention" }`.

## Dependencies

- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
- [26-conv-permission-model](26-conv-permission-model.md)
- [31-conv-message-edit-delete-tombstones](31-conv-message-edit-delete-tombstones.md)
