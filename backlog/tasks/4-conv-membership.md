# server — conversations: membership lifecycle

**Status**: todo
**Type**: backend
**Issue**: [#4](https://github.com/marmotz/ekoz/issues/4)

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

- 1-conv-room-model-and-hierarchy (done — `tasks/done/server-1-conv-room-model-and-hierarchy.md`)
- 2-conv-event-log-and-seq (done — `tasks/done/server-2-conv-event-log-and-seq.md`)
- 3-conv-permission-model (done — `tasks/done/server-3-conv-permission-model.md`)
