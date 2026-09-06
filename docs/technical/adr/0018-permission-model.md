# 0018 — Permission model

**Status**: accepted

## Context

The functional spec calls for "fine-grained permissions at every relevant
level". [ADR 0003](0003-conversation-data-model.md) fixed six named roles
inherited from a space down to its rooms, with per-room overrides and a
"most restrictive wins" hint. The first increment needs a concrete, testable
model, and the decision was taken to ship a fully granular ACL from the start
(not just a fixed role matrix).

## Decision

A capability-based ACL layered on named roles.

- **Capabilities**: a closed, versioned set of room-scoped capability strings
  (`room.post`, `room.edit_any`, `room.delete_any`, `room.pin`, `room.react`,
  `room.invite`, `room.kick`, `room.ban`, `room.manage_members`,
  `room.manage_roles`, `room.manage_retention`, `room.read`, `space.create_child`,
  `space.manage`, `directory.publish`). The list is part of the protocol and
  grows only additively.
- **Roles**: `owner` (server-level, implicit allow-all), `space_admin`,
  `room_admin`, `moderator`, `member`, `reader`. Each role has a **default
  capability set** seeded in `role_default_capability` (server scope; editable by
  an owner later, effectively fixed for the first increment).
- **Overrides**, from least to most specific, each an explicit `allow` / `deny`:
  1. `role_default_capability` (server-wide defaults per role);
  2. `room_permission_override(node_id, role, capability, effect)` on any node
     (space or room) — inherited by descendants;
  3. `room_member_permission(node_id, user_id, capability, effect)` — a grant or
     denial for one user on one node, inherited by descendants.
- **Resolution** for `(user, room, capability)`:
  1. server owner → `allow`.
  2. compute the user's effective role in the room: explicit membership role on
     the room, else the role inherited from the nearest ancestor space where the
     user is a member, else the room's `default_role` if the room is joinable by
     the user (public / matching invite), else no access.
  3. seed the decision from `role_default_capability[role][capability]`.
  4. walk the ancestor chain **root → room**; at each node apply, in order, the
     matching `room_permission_override` (by role) then `room_member_permission`
     (by user). **The closest node wins**, and at equal distance the per-user
     entry beats the per-role entry.
  5. absence of any entry → the seeded default; default-absent → `deny`.

This supersedes the informal "most restrictive wins" phrasing of ADR 0003:
conflicts are resolved by specificity (closest node, then per-user), not by
picking the most restrictive.

## Consequences

- One resolver, one code path, exhaustively unit-tested against a fixture tree.
- The closure table ([ADR 0003](0003-conversation-data-model.md)) supplies the
  ancestor chain in one query; effective permissions for a room are cacheable and
  invalidated on any membership/override change in its subtree.
- The protocol exposes the capability list and a "my effective capabilities in
  this room" endpoint so clients can render the right controls.
- `server-administration` later exposes editing `role_default_capability` and the
  overrides; the mechanism ships now.
