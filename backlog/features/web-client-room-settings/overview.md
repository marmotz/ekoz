# Web client room settings

**Status**: designed, see [technical.md](./technical.md)

## Context

The server lets authorised users edit a room (`PATCH /rooms/:id`), move it,
delete it, publish or unpublish it in the directory and set permission
overrides, see
[rooms and permissions](../../../docs/protocol/rooms-and-permissions.md) and
[retention and tombstones](../../../docs/technical/retention-and-tombstones.md).
[`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md) only covers creating,
joining and leaving; editing, moving, deleting and permission overrides were
left as follow-ups.

Two gaps in the current protocol keep a client from doing this end to end:

- overrides can be written (`PUT /rooms/:id/permissions`) but neither read back
  nor removed;
- the retention rule and its worker exist on the server, but the protocol pages,
  the SDK and the client do not cover them.

## Goal

A space or room administrator manages a room's settings from the web client:
name and topic, visibility and directory listing, position in the hierarchy,
permissions, retention, deletion.

## Decisions made

- **Scope**: protocol, server, SDK and web client. The gaps above are closed
  by this feature, not by a separate one.
- **Targets**: channels and spaces share one settings screen; tabs are shown
  according to the caller's capabilities. Opened from a button in the room /
  space header (the sidebar has no per-room capabilities). `dm` / `group_dm` have no settings.
- **General tab**: name, topic, read-only flag, visibility and directory
  listing (publish / unpublish, `directory.publish`), and move (new parent, or
  root for a space). Cycle and max-depth errors are explained in the UI.
  Avatar and `defaultRole` are out of scope.
- **Permissions tab**: role x capability matrix, each cell allow / deny /
  inherited, showing the inherited value. Role-scoped overrides only;
  per-user overrides are out of scope. Needs a new read endpoint for the
  current overrides.
- **Retention tab**: rule = maximum message age (or unlimited) plus action on
  expiry (hide or delete with tombstone, see
  [retention and tombstones](../../../docs/technical/retention-and-tombstones.md)),
  or "inherit". Set per space or room, inherited by descendants, overriding a
  server-wide default. Needs `room.manage_retention`. The minimum duration is
  1 hour.
- **Retention worker**: already implemented on the server, so a configured rule
  has an effect (applied on the next sweep). Not part of this feature.
- **Lockout guard**: the server refuses a role-wide deny of `room.read`,
  `room.manage_permissions` or `space.manage` for `space_admin` / `room_admin`.
- **Visibility and directory**: the UI drives `PATCH visibility`; going to or
  from `public` also needs `directory.publish`.
- **Move authority**: moving needs `space.create_child` on the destination,
  and detaching a space to the root is owner-only.
- **Read-only**: the composer already honours it; the room is only kept fresh
  live.
- **Deletion**: danger zone, confirmed by typing the room name. While the room
  has live children the server refuses (`room.not_empty`); the UI then lists
  the children to move or delete first. No cascade.
- **Placement in the flow**: a "Groups" tab is added later by
  [`web-client-mentions`](../../_archives/features/web-client-mentions/overview.md).


## Dependencies

- [`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md): room header, room gate
  and capabilities.
- [`web-client-room-moderation`](../web-client-room-moderation/overview.md):
  sibling feature, no ordering constraint.
- Consumed by [`web-client-mentions`](../../_archives/features/web-client-mentions/overview.md): adds a
  "Groups" tab to the room and space settings.
