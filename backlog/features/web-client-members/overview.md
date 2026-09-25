# Web client members

**Status**: technical design, see [technical.md](./technical.md)

## Context

The web client shows a room's messages but not who is in it. The server already
exposes the effective members of a room (`GET /rooms/:id/members`, added by
[`web-client-chat`](../../_archives/features/web-client-chat/overview.md) for author names) and public
profiles (`GET /users/:identifier`), see
[rooms and permissions](../../../docs/protocol/rooms-and-permissions.md) and
[identity](../../../docs/protocol/identity.md). The chat design already names a future
members panel as a consumer of that endpoint. An author who left the room is shown
as "Unknown user" today (chat limitation L1).

## Goal

Anyone reading a room can see who is in it and open a member's public profile
(display name, identifier, avatar, biography), which becomes the entry point for
member-level actions (direct message, moderation).

## Decisions made

### Members panel

- A collapsible side panel next to the chat, opened and closed from the room
  header; the chat stays visible. On small screens it opens as a full-screen
  sheet.
- Shown to anyone who can read the room, including a non-member reading a public
  room. It covers spaces' channels; direct and group conversations reuse it in
  [`web-client-direct-messages`](../web-client-direct-messages/overview.md).
- Lists the effective members (explicit plus inherited from ancestor spaces), with
  a total count.
- Two views, switchable:
  - **by role** (default): one section per role (room admin, moderator, member,
    reader), alphabetical within each section, with a count per section;
  - **alphabetical**: a single list, the role shown as a badge.
- A search field filters the list by display name and identifier.
- The chosen view and the panel's open or closed state are remembered locally in
  the browser, for every room.

### Profile card

- Clicking a member opens a popover card: avatar, display name, identifier,
  biography and the member's role in the room. It is the place where later
  features add member-level actions (direct message, moderation).
- The card opens from: an entry of the members panel, a message author's name or
  avatar in the timeline, and the user's own menu (to see their public profile as
  others see it).
- Aligned with [`web-client-mentions`](../web-client-mentions/overview.md):
  - an author who **left** the room shows their current display name with a
    "left" marker (🚪) instead of "Unknown user", and their card still opens;
  - a **deleted** account (the only case without an identifier) shows as a deleted
    account (💀) and is not clickable.
  The server addition needed to resolve users who are no longer members is part of
  this feature; mentions reuses it.

### Out of scope

- Presence: dots and the "hide offline members" filter are added to this panel by
  [`web-client-presence-and-typing`](../web-client-presence-and-typing/overview.md).
- Member actions (direct message, invite, role change, remove, ban): owned by
  [`web-client-direct-messages`](../web-client-direct-messages/overview.md) and
  [`web-client-room-moderation`](../web-client-room-moderation/overview.md).

## Dependencies

- [`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md) and
  [`web-client-chat`](../../_archives/features/web-client-chat/overview.md): room view and members query.
- Delivered **before**
  [`web-client-presence-and-typing`](../web-client-presence-and-typing/overview.md),
  which adds presence to the panel and the card.
- [`web-client-room-moderation`](../web-client-room-moderation/technical.md) puts its
  moderator-side UI in `features/members` (panel rows and sections) and builds on
  `shared/members` and `shared/profile`.
- Consumed by [`web-client-direct-messages`](../web-client-direct-messages/overview.md),
  [`web-client-room-moderation`](../web-client-room-moderation/overview.md) and
  [`web-client-mentions`](../web-client-mentions/overview.md).
