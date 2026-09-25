# Web client read state

**Status**: designed, see [technical.md](./technical.md)

## Context

The protocol has per-room read markers and receipts visible to participants
(`PUT /rooms/:id/receipt`, `GET /rooms/:id/receipts`), see
[messages and interactions](../../../docs/protocol/messages-and-interactions.md#read-markers).
The client only shows a session-only "unseen" dot; read markers, unread counters
and the live refresh of the rooms list and invitations were left as follow-ups by
[`web-client-chat`](../../_archives/features/web-client-chat/overview.md) and
[`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md).

## Goal

A user knows, across devices, which rooms have unread messages and where they
stopped reading, sees who has read a message, and their rooms list and
invitations stay current without reloading.

## Decisions made

- **Read marker**: sent automatically when the latest message is visible in an
  active, focused window (light debounce). No "mark as read" button in this scope.
- **Unread display**: a numeric counter badge per room in the sidebar, replacing
  the session-only "unseen" dot; it is derived from the server marker so it is
  consistent across devices.
- **Read receipts**: small avatars of the members whose marker points at a
  message, shown under the last message they have read.
- **Live refresh**: the rooms list and invitations update in realtime without
  reloading; part of this feature.
- **Counter source**: the server computes `unreadCount` on `GET /rooms`
  (messages of others only), capped at 100 and shown as `99+`. Without a marker,
  it counts since the member joined.
- **Inherited rooms**: markers and counters extend to effective members (space
  members reading a channel through inheritance), which `web-client-mentions` needs.
- **Collapsed spaces**: a collapsed space shows the sum of its descendants' unread
  counts; an expanded one shows none.
- **Out of scope**: DM and group DM counters, owned by
  [`web-client-direct-messages`](../web-client-direct-messages/overview.md).

## Dependencies

- [`web-client-chat`](../../_archives/features/web-client-chat/overview.md): realtime stream and unseen store.
- [`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md): sidebar tree.
- Consumed by [`web-client-mentions`](../web-client-mentions/overview.md): unread
  mention counters rely on read markers.
