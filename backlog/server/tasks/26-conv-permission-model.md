# server — conversations: capability ACL and resolver

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#26](https://github.com/ekoz-chat/server/issues/26)

Reference: [../features/conversations/technical.md §6](../features/conversations/technical.md#6-roles-capabilities-resolver),
[ADR 0018](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0018-permission-model.md).

## To do

1. Prisma models: `RoleDefaultCapability`, `RoomPermissionOverride`,
   `RoomMemberPermission`. `RoomRole` / `OverrideEffect` enums.
2. Capability constant list (closed, protocol-versioned).
3. Seed `role_default_capability` from the §6 matrix (migration + seed).
4. `PermissionService.can(userId, roomId, capability)` per ADR 0018: owner
   bypass → effective role (membership or nearest ancestor space) → seeded
   default → ancestor-chain overrides (role then user, closest wins).
5. Effective-capability cache keyed `(roomId, userId)`, invalidated on
   membership / role / override / ban / move changes in the subtree.
6. `GET /rooms/:id/my-permissions`; `PUT /rooms/:id/permissions`,
   `PUT /rooms/:id/members/:userId/permissions` (needs `room.manage_permissions`),
   emitting `permission_override_changed`.

## Dependencies

- [24-conv-room-model-and-hierarchy](24-conv-room-model-and-hierarchy.md)
- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
