# server — conversations: message edit, delete, tombstones

**Status**: todo
**Type**: backend
**Issue**: [#8](https://github.com/marmotz/ekoz/issues/8)

Reference: [../features/conversations/technical.md §12](../features/conversations/technical.md#12-edit-delete-tombstones),
[retention and tombstones](../../docs/technical/retention-and-tombstones.md).

## To do

1. `PATCH /rooms/:id/messages/:messageId { body }` — `room.edit_own` (author,
   within `messages.edit_window` if set) or `room.edit_any`; set `editedAt`,
   emit `message_edited { editedAt }` (never the old body); no version history.
2. `DELETE /rooms/:id/messages/:messageId` — `room.delete_own` / `room.delete_any`;
   set `redactedAt`/`redactedById`, clear `body`, cascade-remove `reaction` /
   `message_mention` / `message_pin`; rewrite the original `message_created`
   event into a tombstone; emit `message_redacted`.
3. Shared helper reused by the retention worker for `delete` mode.

## Dependencies

- 7-conv-messages (done — `tasks/done/server-7-conv-messages.md`)
