# Web client mentions

**Status**: done, see [technical.md](./technical.md)

## Context

Mentions are structured: the client sends `mentions: [userId]` alongside
`body`, the server checks each user is a room member and echoes the list in
`Message.mentions`; the `@name` in the body is cosmetic, see
[messages and interactions](../../../docs/protocol/messages-and-interactions.md#restricted-markdown).
[`web-client-chat`](../../_archives/features/web-client-chat/overview.md) left mentions in the
composer as a follow-up; the client neither sends nor highlights them. The
protocol today only knows individual mentions, fixed at send time (`PATCH`
takes `{ body }` only), and offers no way to list or count a user's mentions.

## Goal

A user can mention a room member, a role, a group or the whole room from the
composer, and sees clearly, across rooms, the messages that mention them.

## Decisions made

### Composing

- Typing `@` in the composer opens an autocompletion filtered on what can be
  mentioned; picking an entry inserts the mention.
- The composer shows a mention as the target's display name (`@Alice Martin`),
  coloured to stand out; the stored body carries the canonical identifier
  (`@alice/chat.example`), never the display name.
- Mention targets:
  - a member of the room (effective membership, as the protocol already
    requires);
  - `@all`: every effective member of the room;
  - `@<role>` for each room role (`@room_admin`, `@moderator`, ...): members
    whose effective role matches;
  - `@<group>`: a room group (see below).
- Any member allowed to post may use every kind of mention, collective ones
  included; no extra capability.
- Collective mentions resolve to the effective members **at send time**; a
  member who joins later is not concerned.
- Editing a message can add or remove mentions (the protocol is extended
  accordingly). An added mention counts as a new mention for its recipient; a
  removed one disappears from their counter and list.

### Rendering

- In the timeline, a mention is a chip showing the target's **current** display
  name; it stays correct after a display name or identifier change.
- Chips look different per kind: person, role, group, whole room.
- Deleted account: `@alice/chat.example 💀`, not clickable.
- Member who left the room: `@Alice Martin 🚪`.
- An `@...` in the body that is not a structured mention stays plain text.

### Messages that concern me

A message concerns me when it mentions me directly or through `@all`, one of
my roles or one of my groups. Direct and collective mentions are both counted
but visually distinguished.

- Such a message is highlighted in the timeline.
- The sidebar shows, per room, a counter of unread mentions.
- A "My mentions" entry at the top of the sidebar, with the total unread,
  lists those messages across rooms; opening an item jumps to the message in
  its room.
- The protocol, server and SDK additions needed for the counter and the list
  are part of this feature.

### Room groups

- A group is a named set of members, defined on a room or a space; a space
  group can be mentioned in every descendant room, like inherited roles.
- Groups are managed through a new capability `room.manage_groups`, granted by
  default to `room_admin` and `space_admin`, overridable like the others.
- `all` and role names are reserved and cannot name a group. Users are always
  written `name/server`, so they never collide with a group or role.
- Groups are managed in the room / space settings ("Groups" tab).

### Out of scope

- Delivering notifications for mentions: owned by
  [`notifications`](../notifications/overview.md), which consumes the
  structured mentions (direct, collective, added on edit).

## Dependencies

- [`web-client-members`](../web-client-members/overview.md): member list to pick
  from, and the resolution of users who left the room (display name, 🚪 marker).
- [`web-client-composer-formatting`](../web-client-composer-formatting/overview.md):
  same composer.
- [`web-client-read-state`](../web-client-read-state/overview.md): read markers
  define which mentions are unread.
- [`web-client-message-actions`](../web-client-message-actions/overview.md):
  message editing, where mentions can change.
- [`web-client-room-settings`](../web-client-room-settings/overview.md): hosts the
  "Groups" tab.
- [`notifications`](../notifications/overview.md): mentions are a notifiable event,
  handled there.
