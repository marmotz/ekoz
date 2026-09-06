# server — conversations: membership lifecycle

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#27](https://github.com/ekoz-chat/server/issues/27)

Reference: [../features/conversations/technical.md §9](../features/conversations/technical.md#9-membership-lifecycle).

## To do

1. Prisma models: `Membership`, `RoomInvitation`, `RoomJoinRequest`, `RoomBan`.
2. Endpoints: join public channel, leave, invite / accept / decline, join-request
   / approve / reject, kick, ban / unban, role change (`PATCH .../members/:userId`).
3. Events: `member_joined` / `member_left` / `member_kicked` / `member_banned` /
   `member_unbanned` / `role_changed`.
4. Guards: `RoomBan` blocks join; a role cannot be set above the caller's
   effective authority.
5. Account-feed entries for invitations and join-request outcomes.

## Dependencies

- [24-conv-room-model-and-hierarchy](24-conv-room-model-and-hierarchy.md)
- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
- [26-conv-permission-model](26-conv-permission-model.md)
