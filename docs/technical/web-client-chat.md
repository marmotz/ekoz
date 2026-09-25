# Web client chat

## Context

`apps/client-web` could sign in and list rooms but not show a conversation. The
`web-client-chat` scope adds the room view: read the history, send text messages and
see other members' messages, edits and deletions arrive live, all through
`@ekozhq/sdk`.

Checking the product scoping against the code showed that the server and the SDK
could not support it:

- there was no endpoint listing a room's messages, and `GET /sync` only pages
  forward over a log where `seq` counts every room event, so "the last N events"
  may hold no message at all;
- `message_edited` carried no `messageId`, and a deletion rewrote the original
  `message_created` row in place without appending any event, so no connected client
  could ever learn about it;
- the account feed still held the deleted body until pruned, and `GET /events`
  without a cursor replayed the whole retained feed;
- a message only has an `authorId` (ULID) and no endpoint resolved it to a name;
- the feed fanned out to explicit `Membership` rows only, while access to a room
  also comes from its ancestor spaces;
- the stream ticket is single use, so a native `EventSource` auto-retry, which
  replays the same URL, fails after the first drop.

The scope therefore spans the server, the protocol pages, the SDK and the client.
The feature-level design is in
[`backlog/_archives/features/web-client-chat/technical.md`](../../backlog/_archives/features/web-client-chat/technical.md);
this page records what shipped and why. It builds on
[web client bootstrap](web-client-bootstrap.md) (boundaries, session, SDK client),
[real-time transport](realtime-transport.md) and the
[permission model](permission-model.md).

## Decision

### Server and protocol

Every change was protocol-first: the page under `docs/protocol/` and
[`docs/protocol/CHANGELOG.md`](../protocol/CHANGELOG.md) before the code, then
`openapi.json` and the SDK types (see
[HTTP API conventions](api-conventions.md)).

- **`GET /rooms/:id/messages`**: history, newest page first, `before` (an exclusive
  `seq`) as cursor, `limit` default 50 capped by `messages.max_page` (default 100).
  Items are ascending inside a page; redacted messages come back as tombstones.
  `lastSeq` is read **before** the messages, so applying later events with
  `seq > lastSeq` is safe and idempotent.
- **`GET /rooms/:id/members`**: the effective members (explicit plus ancestor
  spaces, nearest role wins), each with a `UserSummary`, paged by opaque cursor.
- **Live edit and delete**: `message_edited` carries `{ messageId, editedAt }`; a new
  `message_deleted` event `{ messageId, messageSeq, reason }` is appended in the
  redaction transaction, so it gets a `seq`, is fanned out and served by `/sync` and
  `/events`. The in-place tombstone of the original row is kept. Retention deletions
  emit one event per message. The same transaction rewrites the account feed rows
  that mirrored the original `message_created`, closing the leak of the deleted body.
- **Stream start**: `GET /events` with neither `Last-Event-ID` nor `?lastEventId=`
  starts at the current head of the feed (live frames only).
- **Fan-out**: room events are written to the effective members, one feed row per
  distinct user. Cost and limits are recorded in
  [real-time transport](realtime-transport.md).

### SDK

`createClient` gains `messages` (`list`, `get`, `send`), `rooms.members`, `sync.get`
and `stream`. `RoomEvent` is a hand-written discriminated union on `type`, because
the generated types are wrong for this surface (content typed `string`, timestamps
typed `Date` while the wire carries ISO strings) and the SDK does not parse
responses. The client therefore never relies on `Date` instances.

`stream` owns reconnection: on every `error` it closes the `EventSource` at once,
mints a fresh ticket through `session.request` (so a 401 refreshes the token) and
retries after a jittered backoff (1 s doubling to 30 s, reset on `open`), passing the
last seen `feedSeq` as `lastEventId`. An authentication failure stops the loop.
`disconnect()` also runs on `session:invalid`. `reconnected` fires on every re-open
after the first. `EventSource` is injectable, like `fetch`.

### Client layout and boundaries

```
src/shared/realtime/   provider, subscription hooks, unseen-rooms store
src/features/chat/
  api/         query keys and queryFns (timeline first page, older page)
  lib/         timeline.ts (pure reducer), composer-state.ts, mention-node.ts, ...
  hooks/       use-timeline, use-timeline-sync, use-send-message, use-authors, ...
  components/  room-chat, message-list, message-item, composer (TipTap),
               connection-banner
src/shared/messages/  message-body, markdown-allow-list (shared with My mentions)
src/routes/_app/rooms/$roomId.tsx
```

The route composes the two features (a route may import both):
`RoomGate` (web-client-rooms) resolves access and hands `room`, `capabilities` and
the membership state (`member`, `invited`, `joinable`) to `RoomChat` as props. The
chat fetches nothing about access, so there is one owner and one cache for it, and
the features still never import each other.

### Stream ownership

One SSE connection per authenticated session. `RealtimeProvider`, mounted once in
`app/providers`, connects the SDK stream while the session is `authenticated` and
disconnects (and forgets the unseen rooms) when it leaves that state. `shared/realtime`
only dispatches: `useConnectionStatus`, `useRoomEvents`, `useAccountEvents`,
`useReconnected`. It interprets a single thing, that a `message_created` from
someone other than the caller in a room that is not the active one marks the room
unseen. That store is in memory (reset on reload) and `shared` exposes it as
`useRoomHasUnseen`, so the room tree can read it without importing the chat.
Everything else is interpreted by the feature that owns the state.

### Timeline state

A TanStack Query entry per room (`['chat', 'timeline', roomId]`), holding
`{ messages, hasMoreOlder, hasMoreNewer, lastSeq, pending }`, updated by the pure functions of
`lib/timeline.ts`, the only place room events are interpreted:

- an event with `seq <= lastSeq` is ignored, which is what makes the overlapping
  sources (stream, feed replay by `lastEventId`, `/sync` catch-up, the `POST`
  response) harmless;
- `message_created` inserts by `seq`, skipped when the id is already present, and
  paused while the timeline is detached (`hasMoreNewer`, see
  [web client mentions](web-client-mentions.md));
- `message_edited` carries no body on purpose: the message is refetched and replaced;
- `message_deleted` (and `message_redacted` seen through `/sync`) replaces the
  message with a tombstone.

Only the mounted `RoomChat` subscribes to live events, so the entry is removed on
unmount, otherwise a cached timeline of a closed room would go stale. The query is
never refetched on its own (that would drop live state). Events arriving before the
first page has loaded are buffered and applied afterwards.

**Open a room.** First page from `messages.list`, then older pages on scroll with
`before` set to the first loaded `seq`. With `?at=<seq>` the first page is the window
`around` that message, and newer pages load with `after`.

**Reconnect.** On `reconnected`, `/sync` from `lastSeq` runs for up to 5 pages
through the same reducer; a larger gap, or a failure, resets the query and reloads
the newest page. A banner is shown while the stream is not `open`.

**Send.** The composer adds a pending entry and calls `messages.send`. On success the
entry is replaced by the message, idempotently with the stream. On failure it stays as
`failed` with a mapped reason (`room.read_only`, `room.permission_denied`,
`message.body_too_long`, `message.body_invalid`, network, unknown) and a Retry action.
The composer is enabled only for `membership === 'member'` with `room.post` and, on a
read-only room, `room.edit_any`, mirroring the server rule. The client does not know
`messages.body_max_length`, so it does not pre-validate length; the server `422` is
displayed. Mentions are sent since [web client mentions](web-client-mentions.md): the
composer hands `{ body, mentions }` over, and `message.mention_not_member` /
`message.mention_invalid` map to a `mention_invalid` failure.

### Authors and rendering

`use-authors` reads the shared members list (`shared/members`, key
`['members', roomId]`, refreshed on every membership event). A null author, or a member
whose `displayName` is null, is shown as "Deleted account"; an author missing from the
list is looked up through `GET /users?ids=` and shown with their name and a marker.
See [web client members](web-client-members.md). Strings live under
`chat.*` in `common.json` (French and English), like the `rooms.*` keys, because key
typing derives from that file only.

Bodies are rendered with `react-markdown` and `remark-gfm`, by `MessageBody` in
`shared/messages`: `skipHtml`, an allow-list of elements (`p`, `em`, `strong`, `del`,
`code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `br`, and `mention` for the chips), `unwrapDisallowed`, and a `urlTransform` accepting only
`http:`, `https:` and `mailto:`, the schemes the server accepts. Links open with
`target="_blank"` and `rel="noopener noreferrer nofollow"`. Tombstones render a
"message deleted" line, edited messages an "edited" marker, and messages with
`hiddenAt` are not rendered.

## Alternatives

| Topic                          | Chosen                                                                       | Rejected                                                         | Why                                                                                                                                                                |
|--------------------------------|------------------------------------------------------------------------------|------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| History source                 | New `GET /rooms/:id/messages` (current state, `before` cursor)               | Folding the `/sync` log backwards                                | `seq` counts every event and edits live in later events: folding needs window-by-window loops and re-fetching. The server already holds the current state.        |
| Author names                   | `GET /rooms/:id/members` with public profile fields                          | Batch lookup by ULID; embedding `author` in messages and events  | Also serves the members panel and shares the `UserSummary` shape. Limitation L1, resolved by [web client members](web-client-members.md).                                                                            |
| Live edit and delete           | `messageId` in `message_edited`; new `message_deleted` event                 | Ignoring them; reusing `message_redacted`                        | Without them no client sees a change. A new type keeps the in-place tombstone row distinct from the live notification, at the cost of one enum value and a migration. |
| Stream reconnection            | Owned by the SDK, fresh ticket each time                                     | Native `EventSource` auto-retry; leaving it to the client        | The ticket is single use, so the native retry fails.                                                                                                               |
| SSE transport in the SDK       | `EventSource` (injectable), closed on error and re-created                   | `fetch` plus a hand-written SSE parser                           | The ticket is a query parameter, so no header is needed and there is no parser to maintain.                                                                        |
| Stream ownership in the client | One connection per session in `shared/realtime`, dispatch only               | Opened by the chat view; interpreting events in `shared`         | `shared` is the only place `rooms` and `chat` may both read, and it cannot import either feature's reducer or query keys. Each feature updates its own cache.      |
| Timeline state                 | Query cache entry per room, pure reducer, removed on unmount                 | Separate store; `useInfiniteQuery`; timelines kept for every room | Same cache as the rest of the app, reducer testable without React. `useInfiniteQuery` cannot absorb live inserts cleanly; a closed room's entry would miss events. |
| Room access data               | Resolved once by `RoomGate`, passed as props                                 | A second `rooms.get` / `myPermissions` inside the chat           | One owner, one cache, no duplicate requests.                                                                                                                       |
| Inherited rooms live           | Write-time fan-out to effective members                                      | Client-side `/sync` fallback; explicit memberships in channels   | A fallback has no unseen state and no stream catch-up; explicit memberships duplicate the permission model.                                                        |
| Feed leak on delete            | Scrub feed rows in the redaction transaction                                 | Leave it to pruning                                              | Deleted content could otherwise be replayed by `GET /events`.                                                                                                      |
| Feature strings                | `chat.*` keys in `common.json`                                               | A `chat` i18next namespace                                       | Key typing derives from `common.json` only.                                                                                                                        |
| Markdown                       | `react-markdown` + `remark-gfm`, element allow-list                          | `marked` + `dangerouslySetInnerHTML`; own renderer               | Same parser family as the server, no raw HTML path.                                                                                                                |

## Consequences

- **L1 (resolved).** An author who left the room is no longer in the members list. It
  is now resolved through `GET /users?ids=` and shows the name with a marker; see
  [web client members](web-client-members.md).
- **L2.** `POST /rooms/:id/messages` has no idempotency key: a Retry after a lost
  response can create a duplicate.
- **L3.** A non-member reading a public room (`joinable`) or an invited room
  (`invited`) gets the history but no live events, because the feed fans out per
  membership.
- **L4.** The fan-out is synchronous in the append transaction and proportional to
  the effective members of a room: a very large space makes every message send
  slower. The asynchronous worker named in [real-time transport](realtime-transport.md)
  is the planned evolution.
- The fan-out checks that a membership exists, not the `room.read` capability, so a
  `deny` override on `room.read` is not honoured by the feed (`GET /sync` still
  enforces it).
- A fresh `GET /events` connection no longer replays the retained feed: clients that
  need history read `/messages` and `/sync`.
- Only the open room updates live; everything else is invalidated or refetched when
  opened. Edit and delete actions, reactions, pins, read markers, typing and presence
  are follow-ups (unread mention counters shipped with
  [web client mentions](web-client-mentions.md)).
- A gap in the SDK is fixed in `packages/sdk`, never worked around in the client.
