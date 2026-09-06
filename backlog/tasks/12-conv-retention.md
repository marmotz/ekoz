# server — conversations: retention policies and worker

**Status**: todo
**Type**: backend
**Issue**: [#12](https://github.com/marmotz/ekoz/issues/12)

Reference: [../features/conversations/technical.md §13](../features/conversations/technical.md#13-retention),
[retention and tombstones](../../docs/technical/retention-and-tombstones.md).

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

- 2-conv-event-log-and-seq (done — `tasks/done/server-2-conv-event-log-and-seq.md`)
- 3-conv-permission-model (done — `tasks/done/server-3-conv-permission-model.md`)
- 8-conv-message-edit-delete-tombstones (done — `tasks/done/server-8-conv-message-edit-delete-tombstones.md`)
