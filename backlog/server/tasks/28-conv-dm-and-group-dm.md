# server — conversations: direct and group conversations

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#28](https://github.com/ekoz-chat/server/issues/28)

Reference: [../features/conversations/technical.md §7](../features/conversations/technical.md#7-room-types).

## To do

1. `POST /dms { userId }` — compute `dmKey = sorted(callerId, userId)`, upsert,
   return the existing room if any (dedup).
2. `POST /group-dms { userIds, name? }`.
3. Per-user hide/archive for `dm` (a `Membership.hiddenAt` flag; hiding does not
   remove membership).
4. Flattened roles: all participants `member`; a light `room_admin` for a
   `group_dm` creator limited to `room.manage_members`.
5. `dm` / `group_dm` never in the closure beyond their self row, never in the
   directory.

## Dependencies

- [24-conv-room-model-and-hierarchy](24-conv-room-model-and-hierarchy.md)
- [27-conv-membership](27-conv-membership.md)
