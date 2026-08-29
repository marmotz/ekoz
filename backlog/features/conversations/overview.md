# Conversations

**Status**: in discussion

## Context

Messaging must support exchanges between an arbitrary number of people while
allowing an organisation suited to communities as well as to organisations.

## Goal

Provide hierarchical spaces that structure conversations and their members.
Messages must be retained according to configurable retention rules.

## Decisions made

- The hierarchy is made of spaces and rooms.
- A space can contain sub-spaces and rooms; only rooms contain messages. Space
  nesting has no hard limit; a soft limit is configurable (4 by default).
- Technically, spaces and rooms are a single `room` concept with a `type`
  discriminator (`space`, `channel`, `dm`, `group_dm`). See
  [ADR 0003](../../../docs/technical/adr/0003-conversation-data-model.md).
- Rooms can be public, private or invite-only.
- Public rooms are listed and searchable in a server directory.
- Any authenticated user can freely join and leave a public room.
- Only the server owner and space administrators can create sub-spaces and rooms;
  the room administrator manages their room.
- One-to-one (`dm`) and group (`group_dm`) conversations are rooms of a dedicated
  type: same engine for messages, attachments, pinned messages, reactions,
  mentions, read receipts and history as other rooms, but outside the space
  hierarchy, outside the directory, with fixed membership (or membership managed
  without roles) and flattened roles. A one-to-one conversation is deduplicated:
  only one per pair. The old term "special private room" is dropped.
- Permissions rely on roles inherited from a space down to its rooms, with
  possible per-room overrides. A child can therefore be more restricted than its
  parent.
- The provided roles are: server owner, space administrator, room administrator,
  moderator, member and reader. The owner administers the whole server;
  administrators manage their space or their room respectively; the reader
  accesses content without being able to write.
- Moderators can remove or ban a member from a room.
- The author of a message can edit or delete it; a visible event flags it
  without exposing the previous content.
- Message retention is defined by default at the server level and can be
  overridden at the space or room level, subject to the required permissions.
  Each rule chooses between permanent deletion and hiding on expiry. On deletion,
  the actual content is erased and only a contentless audit marker remains. See
  [ADR 0012](../../../docs/technical/adr/0012-retention-and-tombstones.md).
- Basic interactions include replies to a message, reactions and mentions;
  dedicated threads are not part of the first increment.
- Read receipts are available from the first increment and visible to the room
  participants.
- Presence (online / away / offline) and the typing indicator are part of the
  first increment.

## Depends on

- [Identity and profiles](../identity-and-profiles/overview.md), to identify the
  members of spaces and rooms.
- [Server administration](../server-administration/overview.md), for the global
  administration performed by the server owner.

## Feature order

- [Content and sharing](../content-and-sharing/overview.md) extends room
  messages.
- [Notifications](../notifications/overview.md) consume message and room events.
- [Federation](../federation/overview.md) extends rooms, private messages and
  read receipts to other servers.
