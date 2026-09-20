# Web client chat

**Status**: technical design, see [technical.md](./technical.md)

## Context

With rooms available ([`web-client-rooms`](../web-client-rooms/overview.md)), users
need to actually talk: read a room's history, send messages and see new ones
arrive live. This is the client counterpart of the messages and streaming parts
of the [conversations](../../_archives/features/conversations/overview.md) server feature.

Gaps found while scoping, against the current server and SDK:

- There is no "list messages" endpoint: history is only readable through
  `GET /sync?room=&since=`, a forward-only event log where `seq` counts every
  room event, not only messages.
- A message only carries `authorId` (a ULID) and there is no way to resolve it to
  a name: no members endpoint, and profile lookups are by `name/server` only.
- Edits and deletions are invisible to connected clients: `message_edited` has no
  message id, and a deletion rewrites the original event in place without
  emitting anything.
- Live delivery is an SSE stream (`GET /events`) authenticated by a single-use
  ticket from `POST /stream/ticket`; it is best-effort and `/sync` is the source
  of truth after a reconnection.
- `@ekozhq/sdk` has no messages, sync or stream bindings yet.

## Goal

A member of a room can read its history, send a message and see other members'
messages appear without reloading, all against a running reference server.

## Decisions made

- Lives in `src/features/chat/{api,components,hooks,routes}`; all network access
  through [`@ekozhq/sdk`](../../_archives/features/sdk-foundations/overview.md),
  including the SSE connection.
- First increment is text messages only. Sending and receiving are in scope;
  edit and delete actions, reactions, pins, read markers, typing, presence and
  mentions in the composer are follow-ups.
- **History**: a room opens on its latest messages and older ones load on demand
  by scrolling up, from a new paginated `GET /rooms/:id/messages` (current state,
  newest first). `/sync` is only used for reconnection catch-up.
- **Authors**: names and avatars come from a new `GET /rooms/:id/members`
  endpoint. Former members show as "Unknown user" in this increment.
- **Remote edits and deletions**: reflected read-only (an "edited" marker, a
  "message deleted" tombstone), live and in history. The UI offers no edit or
  delete action yet. This requires server protocol changes that are part of this
  feature: `messageId` in `message_edited`, a new `message_deleted` event, and
  scrubbing the deleted body from the account feed.
- **Stream start**: `GET /events` without a cursor starts at the current head of
  the feed instead of replaying everything.
- **Live stream**: one `/events` connection per signed-in session, independent of
  the room on screen. Events for rooms that are not open update the cache without
  being rendered.
- **Reconnection**: automatic, with a fresh stream ticket and `Last-Event-ID`,
  followed by a `/sync` catch-up of the open room to close any gap. A discreet
  connection-state indicator ("reconnecting" / "offline") is shown in the chat
  view during an outage.
- **Rendering**: message bodies render the protocol's restricted Markdown subset
  with strict sanitisation and no raw HTML.
- **Sending**: optimistic. The message shows immediately as "sending", switches to
  a failed state with a retry action if the call fails.
- **Read-only rooms**: a member without send permission sees the history with a
  disabled composer and a message explaining why.
- **Unseen activity**: a simple, session-only dot on a room in the sidebar when a
  message arrives in a room that is not open. No counter, no persistence; unread
  counts and read markers stay follow-ups.

## Dependencies

- [`web-client-rooms`](../web-client-rooms/overview.md) — room selection and
  membership.
- [conversations](../../_archives/features/conversations/overview.md) — server side, already shipped.
- Server changes in `apps/server` (messages list, members list, edit/delete
  events, stream start position) and their protocol pages under `docs/protocol/`.
- SDK bindings for messages, sync, the event stream, `rooms.myPermissions` and
  `rooms.members` in `packages/sdk`, delivered as tasks of this feature (the
  `rooms` resource itself comes from `web-client-rooms`).
- Room URL `/rooms/$roomId`, to be confirmed in the `web-client-rooms` design.

## Feature order

`auth` -> `web-client-rooms` -> **web-client-chat**.
