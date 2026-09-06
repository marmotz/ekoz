# server — conversations: local moderation surface

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#36](https://github.com/ekoz-chat/server/issues/36)

Reference: [../features/conversations/technical.md §17](../features/conversations/technical.md#17-local-moderation).

## To do

1. Thin `moderation/` façade over existing capabilities: delete any message
   (`room.delete_any`), kick (`room.kick`), ban / unban (`room.ban`).
2. Every moderation action writes an `audit_log` entry
   (`action = "moderation.<verb>"`, target = room / message / user) in addition
   to the `room_event`.
3. `GET /rooms/:id/moderation-log` (room-scoped view over the audit log for
   users with a moderation capability).

## Dependencies

- [27-conv-membership](27-conv-membership.md)
- [31-conv-message-edit-delete-tombstones](31-conv-message-edit-delete-tombstones.md)
- server-core [#7 audit log](7-audit-log.md)
