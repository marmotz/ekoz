# Web client timeline system events

**Status**: in discussion, technical design in [technical.md](./technical.md)

## Context

The room event log already records membership and moderation events
(`member_joined`, `member_left`, `member_kicked`, `member_banned`,
`member_unbanned`, `role_changed`), see
[rooms and permissions](../../../docs/protocol/rooms-and-permissions.md). The
web client timeline only renders messages, so these changes are invisible to
the room's members. Deferred from
[`web-client-room-moderation`](../web-client-room-moderation/overview.md), which
only refreshes its own lists.

## Goal

Members of a room see membership and moderation changes as system lines in the
timeline (join, leave, kick, ban, unban, role change; an accepted invitation is
a `member_joined`, the protocol has no distinct event for it).

## Decisions made

- **Events shown**: `member_joined`, `member_left`, `member_kicked`,
  `member_banned`, `member_unbanned`, `role_changed`.
- **Actor**: read from `senderId`, which the server already sets to the actor of
  every membership event; no payload change. The history is served by extending
  `GET /rooms/:id/messages` with the membership events of the page window and the
  profiles they cite (see [technical.md](./technical.md)), so this feature also
  touches the protocol page, the server and the SDK.
- **Ban reason**: never shown in the timeline; the line only states that the
  user was banned.
- **Display**: system lines are ordered by `seq` with the messages, in a muted
  style, with no message actions, and no contribution to unread counters.
- **Grouping**: consecutive events of the **same type** with no message in
  between collapse into one line ("A, B and 3 others joined the room"). A
  message or an event of another type ends the group. Moderation lines that
  carry an actor are grouped only when the actor is the same.
- **Scope**: all room types, DMs included (leaving a DM emits no `member_left`,
  so nothing shows for it).
- **Reader as subject**: an event concerning the reader uses "You" wording
  ("You were kicked by Y") and is never grouped with other users' events.
- All texts go through the i18n catalogues (French + English).

## Dependencies

- [`web-client-room-moderation`](../web-client-room-moderation/overview.md):
  produces the moderation events worth surfacing.
- [`web-client-read-state`](../web-client-read-state/overview.md): system lines do
  not count as unread.
