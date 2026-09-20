# Web client chat — technical design

**Status**: technical design. Follows the decisions in [overview.md](./overview.md).
No code is changed by this document.

## 1. Scope

Read a room's history, send text messages and see other members' messages, edits
and deletions arrive live, in `apps/client-web`, through `@ekozhq/sdk`.

Verifying the overview against the code showed that the current server and SDK
cannot support it (section 2). The scope therefore spans four workspaces:

| Workspace         | Work                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `apps/server`     | Messages list, members list, live edit/delete events, stream start position, fan-out to effective members. |
| `docs/`           | Protocol pages, OpenAPI, one technical page.                                           |
| `packages/sdk`    | `messages`, `rooms.members`, `sync`, `stream` bindings.                                |
| `apps/client-web` | `shared/realtime`, `features/chat`, i18n, route composition.                           |

Out of scope (follow-ups): edit/delete actions in the UI, reactions, pins, read
markers, typing, presence, mentions in the composer, unread counters, redirecting
`/rooms` to the last visited room. The client never sends `mentions`; an `@name`
typed by the user stays plain text.

Depends on [`web-client-rooms`](../web-client-rooms/technical.md), which owns and
delivers first:

- the route tree and `RoomGate`, which resolves whether the user can see a room and
  hands `room` and `capabilities` to the chat (section 7.1);
- the SDK `rooms` resource (`get`, `myPermissions`) and `UserSummary`;
- `useMe` in `shared/sdk/use-me.ts` (query key `['me']`);
- the creator membership (rooms S1): without it a room creator is missing from
  the members list (S2) and from the live fan-out (S5).

## 2. Verified findings

Everything below was checked against the code at the time of writing.

| # | Finding | Evidence | Consequence |
| - | ------- | -------- | ----------- |
| F1 | No messages list endpoint. Only `GET /rooms/:id/messages/:messageId`. | [messages.controller.ts](../../../apps/server/src/modules/conversations/messages/messages.controller.ts) | New endpoint (S1). |
| F2 | `/sync` pages **forward only** and `seq` counts every room event (joins, reactions, pins...). "Last N seq" can hold no message at all. | [sync.service.ts:29](../../../apps/server/src/modules/conversations/streaming/sync.service.ts) | History does not come from `/sync`; it only serves reconnection catch-up. |
| F3 | `message_edited` carries `{ editedAt }` only: no `messageId`. `message_created` keeps the original body in the log. | [messages.service.ts:127](../../../apps/server/src/modules/conversations/messages/messages.service.ts) | A client cannot tell which message was edited. Protocol fix (S3). |
| F4 | A deletion rewrites the original `message_created` row in place (`type: message_redacted`, `content: { reason }`, same `seq`). It appends **no** event and no feed row. | [messages.service.ts:172](../../../apps/server/src/modules/conversations/messages/messages.service.ts) | No connected client ever sees a deletion; `/sync since=` never re-serves it. Protocol fix (S3). |
| F5 | The account feed row for the original `message_created` still holds the body after a deletion, until the feed is pruned. | `redactMessage` does not touch `AccountFeedEvent`; feed payload copied at [feed-fanout.service.ts:35](../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | Deleted content can be replayed by `GET /events`. Scrubbed in S3. |
| F6 | `GET /events` without `Last-Event-ID` starts from cursor `0`: a fresh connection replays the whole retained feed. | [events.controller.ts:100](../../../apps/server/src/modules/conversations/streaming/events.controller.ts), `parseCursor` line 160 | A page load would flood the client. Server change S4. |
| F7 | A message only has `authorId` (ULID). The only profile lookup is `GET /users/:identifier` (`name/server`). No members endpoint exists. | [profile.service.ts:75](../../../apps/server/src/modules/identity/profile/profile.service.ts), controller list above | Author names cannot be shown. New endpoint (S2). |
| F8 | The stream ticket is **single use**. A native `EventSource` reconnects by itself with the same URL, i.e. with a spent ticket. | [ticket.service.ts](../../../apps/server/src/modules/identity/auth/ticket.service.ts), events controller | The SDK owns reconnection and mints a fresh ticket each time. |
| F9 | Generated SDK types are wrong for this surface: `SyncResponseDtoEvents.content` is `string` (the server sends `z.unknown()`), timestamps are typed `Date` (the wire is an ISO string). The SDK does not parse responses. | [sync.dto.ts:19](../../../apps/server/src/modules/conversations/streaming/sync.dto.ts), `packages/sdk/src/generated/api/typescript/` | The SDK hand-writes a discriminated `RoomEvent` union; the client never relies on `Date` instances. |
| F10 | The account feed fans out to **explicit `Membership` rows only**, while effective access also comes from ancestor spaces. | [feed-fanout.service.ts](../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | Server task S5. `web-client-rooms` lists such rooms as `inherited`, so they must update live too. |
| F11 | `GET /rooms/:id/my-permissions` exists (`{ capabilities }`) and `Room.readOnly` is on `GET /rooms/:id`; `MeView.id` is the caller's ULID. | permissions controller, [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md) | Composer state needs no server work. |

## 3. Decisions

| Topic | Retained | Rejected | Why |
| ----- | -------- | -------- | --- |
| History source | New `GET /rooms/:id/messages` (newest first, `before` cursor), current state | Folding the `/sync` log backwards (overview draft) | F2, F3: window-by-window folding, re-fetching edited messages and a loop to find enough messages. The server already holds current state. Replaces the overview's "since = lastSeq - N". |
| Author names | New `GET /rooms/:id/members` with public profile fields | Batch lookup by ULID; embedding `author` in `Message` and events | Chosen with the product owner; the list also serves the future members panel. Limitation: L1. |
| Live edits / deletions | `messageId` in `message_edited`; new `message_deleted` event | Ignoring them; reusing `message_redacted` for the new event | F3, F4. A new type keeps the in-place tombstone row (type `message_redacted`) distinct from the live notification. Costs one enum value and a migration. |
| Stream reconnection | Owned by the SDK (fresh ticket, backoff, `lastEventId`) | Native `EventSource` auto-retry; leaving it to the client | F8; [realtime transport](../../../docs/technical/realtime-transport.md) already says the SDK carries it. |
| SSE transport in the SDK | `EventSource` (injectable), closed on error and re-created | `fetch` + hand-written SSE parser | The ticket is already a query parameter, so headers are not needed; no parser to maintain. |
| Stream scope in the client | One connection per authenticated session, in `shared/realtime`, which only dispatches events (subscription hooks) and keeps the unseen store | Opened by the chat view; interpreting events in `shared` | Decided in the overview; `shared` is the only place both `rooms` and `chat` may read (boundaries), and it cannot import `features/chat` (the reducer) or `features/rooms` (its query keys). Each feature subscribes and updates its own cache. |
| Timeline state | TanStack Query cache entry per room, updated by a pure reducer, kept only while the room is open | Separate store; `useInfiniteQuery`; timelines kept for every visited room | Same cache as the rest of the app; the reducer is unit-testable without React. `useInfiniteQuery` cannot absorb live inserts cleanly. Only the mounted `RoomChat` subscribes, so a cached timeline of a closed room would miss events: it is removed on unmount. |
| Room access data (`room`, `capabilities`, membership state) | Resolved once by `RoomGate` (`web-client-rooms`), passed to `RoomChat` as props | A second `rooms.get` / `myPermissions` inside the chat feature | One owner, one cache (`['rooms','detail',id]`, `['rooms','permissions',id]`), no duplicate requests; the features still never import each other (the route composes them). |
| Feature strings | `chat.*` keys in `common.json` (fr + en) | A `chat` i18next namespace | Same rule as `web-client-rooms`: key typing derives from `common.json` only. |
| Markdown rendering | `react-markdown` + `remark-gfm`, allow-list of elements | `marked` + `dangerouslySetInnerHTML`; own renderer | The server validates with `remark`; same parser family, no raw HTML path. |
| Deleting the feed leak | Scrub feed rows in the redaction transaction | Leave to pruning | F5. |

## 4. Server changes (`apps/server`)

Every change is protocol-first: the page under `docs/protocol/` is updated before
the code (see [HTTP API conventions](../../../docs/technical/api-conventions.md)),
then `openapi.json` is re-emitted (`bun run openapi:emit`) and the SDK types are
regenerated (see [OpenAPI description and SDK types](../../../docs/technical/openapi-description-and-sdk-types.md)).

### S1. `GET /rooms/:id/messages`

- Query: `before` (decimal `seq`, exclusive, optional) and `limit` (default 50,
  capped by a new runtime config `messages.max_page`, default 100).
- Needs `room.read`. Errors: `room.not_found`, `room.permission_denied`, `422`.
- `200`: `{ items: Message[], lastSeq: string, hasMore: boolean }` (same `items`
  envelope as the other listings; `before` stays a `seq` because the paging is
  backwards on the log, which an opaque forward cursor does not express). `items`
  are the `seq < before` window, **ascending** inside the page; pages are fetched
  newest first. Redacted messages are included as tombstones (`redactedAt` set,
  `body: ""`). `hasMore` is true when older messages exist.
- `lastSeq` is read **before** the messages, in the same request: the messages
  are then at least as recent as `lastSeq`, so applying later events with
  `seq > lastSeq` is safe and idempotent.
- Mentions are loaded in one query for the whole page (the single-message path in
  `messages.service.ts` loads them per message).
- Lives in `modules/conversations/messages/`, next to `messages.controller.ts`.

### S2. `GET /rooms/:id/members`

- Query: `cursor` (opaque, optional) and `limit` (default 100, max 200), the same
  parameters as the directory and admin user listings.
- Needs `room.read`. `200`: `{ items: Member[], nextCursor: string | null }`,
  ordered by `userId`.
- `Member = { role, joinedAt, user: UserSummary }`, with the `UserSummary`
  defined by `web-client-rooms` S3 (`{ id, identifier, displayName, avatarUrl }`;
  `identifier` is `name/domain`, or null when the account has no username;
  `avatarUrl` is null without avatar; all three nullable fields are null for a
  deleted account). One shape for every "who" in the client, so the components
  that render a user are shared. `Membership.hiddenAt` is a per-user archive flag
  for `dm` rooms only ([contract.prisma](../../../apps/server/src/core/prisma/contract.prisma))
  and is not relevant here.
- Members are the **effective** ones: explicit memberships on the room plus
  memberships of its ancestor spaces (nearest role wins, resolved through
  `room_closure` like [the permission model](../../../docs/technical/permission-model.md)),
  otherwise a member of a space who never joined the channel would appear as an
  unknown author.

### S3. Live edit and delete events

- `message_edited` content becomes `{ messageId, editedAt }` (additive).
- New room event `message_deleted` with content `{ messageId, messageSeq, reason }`,
  appended in the same transaction as the redaction, so that it gets a new `seq`,
  is fanned out and reaches `/sync` and `/events`. `messageSeq` is the
  `seq` of the original row, which the client uses as its key.
- The in-place rewrite of the original row (`message_redacted`, `{ reason }`) is
  kept: it is what makes history and the log tombstoned. Both live in
  `redactMessage`, which the retention worker also calls
  ([retention-worker.service.ts:112](../../../apps/server/src/modules/conversations/retention/retention-worker.service.ts)),
  so retention deletions emit the event too (one per message; acceptable at this
  scale, noted in the protocol page).
- Feed scrub: in the same transaction, `AccountFeedEvent` rows where
  `roomId` and `roomSeq` match the redacted `seq` get a tombstone payload (same
  shape as the rewritten row), closing F5.
- Enum: add `message_deleted` to `RoomEventType` in
  [contract.prisma:418](../../../apps/server/src/core/prisma/contract.prisma)
  and add the migration.

### S4. Stream start position

`GET /events` with neither `Last-Event-ID` nor `?lastEventId=` starts at the
**current head** of the account's feed (live frames only) instead of `0`.
Clients that need history use `/messages` and `/sync`. The change is in
`EventsController.stream`, where the cursor is initialised; `FeedReaderService`
gets a "head" query. `synchronisation.md` documents the new rule.

### S5. Fan-out to effective members

The account feed fan-out (`feed-fanout.service.ts`) targets the room's explicit
members **and** the members of its ancestor spaces (same resolution as S2 and as
the [permission model](../../../docs/technical/permission-model.md), one feed row
per distinct user), so that a room listed as `inherited` by `web-client-rooms`
receives live events, unseen dots and reconnection catch-up like any other.
Decision: write-time fan-out, not a client-side `/sync` fallback and not explicit
memberships in the channels.

Consequences:

- The cost of `fanOutRoomEvent`, which runs synchronously in the transaction of
  the event append, becomes proportional to the **effective** members (every member
  of the ancestor spaces), not only to the explicit ones. The limit is recorded in
  [realtime transport](../../../docs/technical/realtime-transport.md), where moving
  the fan-out to an asynchronous worker is already the named evolution.
- As today, the fan-out checks presence of a membership, not the `room.read`
  capability: a `deny` override on `room.read` is not honoured (same limitation as
  `web-client-rooms` S2).
- Feed volume grows accordingly; pruning is unchanged.

Protocol policy: S1-S3 are additive; S4 and S5 change delivery behaviour. Check
[SDK packaging and protocol policy](../../../docs/technical/sdk-packaging-and-protocol-policy.md)
before choosing the version note in `docs/protocol/CHANGELOG.md`.

## 5. SDK (`packages/sdk`)

New public surface, added to `createClient` in
[client.ts:65](../../../packages/sdk/src/client.ts) next to the existing
resources, each built on `SessionManager.request`
([session-manager.ts:104](../../../packages/sdk/src/session/session-manager.ts)):

```ts
// client.rooms.get / myPermissions (MyPermissionsResponse) come from web-client-rooms
client.rooms.members(roomId, { cursor?, limit? }): Promise<MembersPage>   // { items: Member[]; nextCursor }, same `rooms` resource
client.messages.list(roomId, { before?, limit? }): Promise<MessagesPage>  // { items: Message[]; lastSeq; hasMore }
client.messages.get(roomId, messageId): Promise<Message>
client.messages.send(roomId, { body, replyToId?, mentions? }): Promise<Message>
client.sync.get({ room, since?, limit? }): Promise<{ events: RoomEvent[]; lastSeq: string }>
client.stream: RoomStream
```

`RoomEvent` is a hand-written discriminated union on `type` (F9) in
`src/types/events.ts`, covering `message_created`, `message_edited`,
`message_deleted`, `message_redacted`, and an `unknown`-content fallback for every
other type. Generated types stay the source for message and page shapes.

### Stream

```ts
interface RoomStream {
  connect(): void;                       // idempotent
  disconnect(): void;
  readonly status: 'idle' | 'connecting' | 'open' | 'reconnecting';
  on('room_event', (e: { roomId; feedSeq; event: RoomEvent }) => void): () => void;
  on('account' | 'presence' | 'typing', ...): () => void;   // 'account' is consumed by web-client-rooms
  on('status', (s) => void): () => void;
  on('reconnected', () => void): () => void;   // fired on every re-open after the first
}
```

Loop: `POST /stream/ticket` through `session.request` (so a 401 refreshes the
token), then `new EventSource(`${api}/events?ticket=${t}[&lastEventId=${feedSeq}]`)`.
On `error` the source is `close()`d immediately (F8), status becomes
`reconnecting`, and a new attempt starts after a jittered backoff (1 s doubling to
30 s, reset on `open`). `feedSeq` is taken from `MessageEvent.lastEventId` of the
last durable frame. A ticket failure with an authentication error stops the loop
(the `session:invalid` path already handles it); other failures retry.
`disconnect()` also runs on `session:invalid` and on logout.

`ClientConfig` gains `eventSource?: typeof EventSource` (default
`globalThis.EventSource`), the same escape hatch as `fetch`. The URL is built
by hand: the `lastEventId` query parameter is functional but not in the OpenAPI
description (comment in `events.controller.ts`).

Changes to `packages/sdk/src` need a changeset (`bunx changeset`).

## 6. Client architecture (`apps/client-web`)

Boundaries ([web client bootstrap](../../../docs/technical/web-client-bootstrap.md)):
`features/chat` imports only `shared` and itself; `shared` imports only `shared`;
routes import features. New code respects that:

```
src/shared/realtime/
  realtime-provider.tsx   # opens/closes sdk.stream with the session; mounted in app/providers
  use-realtime.ts         # useConnectionStatus(), useRoomEvents(handler), useAccountEvents(handler),
                          # useReconnected(handler): generic subscriptions, no event interpretation
  unseen-rooms.ts         # session-only store (useSyncExternalStore): setActiveRoom, useRoomHasUnseen
src/shared/sdk/use-me.ts  # owned by web-client-rooms; the provider reads the caller id from it
src/features/chat/
  api/         query keys + queryFns over the SDK (timeline, members)
  lib/         timeline.ts  (pure reducer), markdown-allow-list.ts
  hooks/       use-timeline, use-timeline-sync, use-send-message, use-authors
  components/  room-chat ({ room, capabilities, membership }), message-list, message-item,
               message-body, composer, connection-banner
src/routes/rooms/$roomId.tsx   # composes <RoomGate> (rooms) around <RoomChat> (chat), see 7.1
```

### 6.1 Timeline state

Query key `['chat', 'timeline', roomId]`, value:

```ts
interface Timeline {
  messages: Message[];     // ascending seq, unique by seq
  hasMoreOlder: boolean;
  lastSeq: string;         // highest room seq reflected in `messages`
  pending: PendingMessage[]; // own optimistic sends, rendered after `messages`
}
```

`lib/timeline.ts` exposes pure functions, the only place events are interpreted:

- `applyRoomEvent(timeline, event): Timeline` and a list of side effects
  (`refetch: messageId[]`). Ignored when `event.seq <= timeline.lastSeq`.
  - `message_created`: build the message from the event (`id` and body in
    `content`, `authorId = senderId`, `seq`, `createdAt`), insert by `seq`,
    skipped if the id is already present (own message already added from the POST).
  - `message_edited`: emit `refetch [messageId]`; the result replaces the message
    (`body`, `editedAt`). The event has no body on purpose.
  - `message_deleted`: replace the message with the given `messageSeq` by a
    tombstone (`redactedAt` set, `body: ""`).
  - `message_redacted` (only seen through `/sync` of an old row): same tombstone,
    keyed by `seq`.
  - other types: advance `lastSeq` only.
- `prependOlder(timeline, page)`, `mergeFirstPage(page)`, `reconcilePending(...)`.

### 6.2 Flows

**Open a room.** `RoomGate` has already resolved access (section 7.1); `RoomChat`
receives `room`, `capabilities` and the membership state as props and fetches
nothing about them. It calls `setActiveRoom(roomId)`, clears the room's unseen dot,
and loads `messages.list(roomId)` (newest page). The first page seeds `messages`,
`hasMoreOlder` and `lastSeq`. Live events for the room that arrive while the page
is loading are buffered and applied afterwards (the `seq > lastSeq` guard makes
this exact). A `403` or `404` from the list shows a generic error state with a
Retry; access changes are handled by `RoomGate` (its queries are invalidated by
the rooms feature, see below). On unmount the room's timeline entry is removed
from the cache.

**Older history.** Scrolling to the top calls
`messages.list(roomId, { before: messages[0].seq })` and `prependOlder`, keeping
the scroll anchor (the previous first message stays in view).

**Live events.** `RealtimeProvider` (shared) subscribes to the SDK stream once and
never interprets events beyond one rule: for a `room_event` that is a
`message_created` from someone other than the caller (`useMe().id`) in a room that
is not the active one, it marks the room unseen (dot in the sidebar). Everything
else is dispatched to feature subscribers:

1. Chat: `use-timeline-sync(roomId)`, mounted by `RoomChat`, subscribes with
   `useRoomEvents` for its own room only, runs `applyRoomEvent` (and the refetches),
   and invalidates `['chat','members',roomId]` on `member_joined`. A room that is
   not open has no timeline entry (removed on unmount) and loads from `/messages`
   when opened.
2. Rooms (`web-client-rooms`, follow-up once `shared/realtime` exists): subscribes
   with `useAccountEvents` (`invitation_created`, `join_request_resolved`) and
   `useRoomEvents` (`room_updated`, `role_changed`, `permission_override_changed`,
   membership changes of the caller) and invalidates its own keys (`list`,
   `invitations`, `detail`, `permissions`). This is also what lets `RoomGate`
   notice a lost or gained access while the chat is open. The chat feature never
   touches these keys.

**Reconnection.** `use-timeline-sync` handles `useReconnected`: for its room it runs
`sync.get({ room, since: timeline.lastSeq })` in a loop (max 5 pages) through
`applyRoomEvent`; if the gap exceeds that, drop the timeline and reload the
first page. The server also replays the durable feed from the SDK's
`lastEventId`, so the two paths overlap and the `seq` guard makes it a no-op the
second time. The rooms feature invalidates its own queries on the same signal. The
banner shows `reconnecting` or `offline` while `status` is not `open`.

**Send.** The composer adds a `PendingMessage { localId, body, state: 'sending' }`
and calls `messages.send`. On success the pending entry is removed and the
message inserted by id (the stream may already have delivered it, so the insert
is idempotent). On failure the entry becomes `failed` with a mapped reason
(`room.read_only`, `room.permission_denied`, `message.body_too_long`,
`message.body_invalid`, network) and a Retry action that re-sends it. Enter
sends, Shift+Enter inserts a newline, empty or whitespace-only input is not sent.

### 6.3 Composer state

`canPost = membership === 'member' && capabilities.includes('room.post') && (!room.readOnly || capabilities.includes('room.edit_any'))`,
where `room` and `capabilities` come from the `RoomGate` props and the rule
mirrors the server one in `POST /rooms/:id/messages`. The `membership === 'member'`
term matters because a pending invitation or a public room's default role can
grant read (and possibly post) capabilities to someone who has not joined yet
(`web-client-rooms` F3, F4): in the `invited` and `joinable` gate states the
history is readable but the composer is disabled with "join the room to write".
Otherwise, when false, the composer is disabled with a text explaining why:
read-only room, or missing permission. The client does not know `messages.body_max_length` (server-only
config), so it does not pre-validate length; the server `422` is displayed.

### 6.4 Authors and rendering

- `use-authors(roomId)` loads `rooms.members` pages (until `nextCursor` is null,
  capped at 5 pages) into `['chat', 'members', roomId]`. Display rules:
  - `authorId` null, or a member whose `user.displayName` is null (deleted
    account): the localized "Deleted account" label, the same one
    `web-client-rooms` uses for invitations and join requests;
  - `authorId` absent from the members list (the author left, limitation L1): a
    localized "Unknown user" placeholder, and one members refetch is triggered.
- `message-body` renders `body` with `react-markdown`: `remarkPlugins={[remarkGfm]}`,
  `skipHtml`, `allowedElements` = `p, em, strong, del, code, pre, blockquote, ul,
  ol, li, a, br`, `unwrapDisallowed`, and a `urlTransform` accepting only
  `http:`, `https:` and `mailto:` (the same schemes the server accepts). Links get
  `target="_blank"` and `rel="noopener noreferrer nofollow"`. Verified props
  (`allowedElements`, `skipHtml`, `urlTransform`, `unwrapDisallowed`) against the
  react-markdown documentation.
- Tombstones render a localized "message deleted" line; an edited message shows an
  "edited" marker. Messages with `hiddenAt` are not rendered.
- New strings go under `chat.*` in `common.json` (`en` and `fr`), like the
  `rooms.*` keys of `web-client-rooms`: key typing derives from `common.json` only.

## 7. Integration points

### 7.1 Route

The chat lives at `/rooms/$roomId`, in the file route
`src/routes/rooms/$roomId.tsx` that `web-client-rooms` owns (section 4.3 there;
directory layout, no flat `rooms.$roomId.tsx`). This design edits that file, it does
not create another route. The route is wrapped in `RequireAuth` and composes the two
features (a route may import both):

```tsx
<RoomGate roomId={roomId}>
  {({ room, capabilities, membership }) => (
    <RoomChat room={room} capabilities={capabilities} membership={membership} />
  )}
</RoomGate>
```

`RoomGate` decides what is shown for each access state and renders its children
only when the room content is readable (`member`, `invited`, `joinable`);
`membership` is that state. `RoomHeader` stays rooms-owned, above the chat.

### 7.2 Unseen dot

`shared/realtime/unseen-rooms.ts` is the seam: `RealtimeProvider` writes it,
`RoomChat` calls `setActiveRoom`, and the room tree in `web-client-rooms` reads
`useRoomHasUnseen(room.id)` from `shared` (wiring listed in that design, 4.4).
Neither feature imports the other. The store is in memory only (reset on reload),
matching the overview.

### 7.3 Documentation and changelog

- Protocol: update `messages-and-interactions.md` (list endpoint, `message_edited`
  payload, `message_deleted`, feed scrub), `rooms-and-permissions.md` (members;
  the same page also receives the `web-client-rooms` additions),
  `synchronisation.md` (stream start position, fan-out to effective members) and
  `docs/protocol/CHANGELOG.md`. Prisma migrations (`message_deleted` enum value) are
  ordered after the `web-client-rooms` creator-membership backfill.
- `docs/technical/realtime-transport.md`: record that the fan-out now covers
  effective members (S5) and its cost limit (L4).
- Hurl files under `apps/server/http/` for the new endpoints
  (`messages/list.hurl`, `rooms/members.hurl`, following the `web-client-rooms`
  convention), with `http/README.md` kept in sync.
- New page `docs/technical/web-client-chat.md` (context, alternatives, consequences)
  written from section 3; linked from `docs/technical/README.md`.
- `apps/server/CHANGELOG.md` and `apps/client-web/CHANGELOG.md` `## [Unreleased]`
  entries, and a changeset for `packages/sdk` (checked by
  `scripts/check-changelog.sh`).

## 8. Tests

- **Server** (`bun run test:server`, needs Docker): unit tests for the list and
  members services (pagination, tombstones, inherited members, permission
  errors), an integration test for delete (event appended, feed scrubbed,
  `/sync` returns `message_deleted`), edit payload, and `/events` starting at the
  head; OpenAPI emit test updated.
- **SDK**: resource tests with the existing fetch mock; stream tests with a fake
  `EventSource` (fresh ticket on each reconnect, backoff, `lastEventId`, stop on
  auth failure, `disconnect()`).
- **Client**: reducer tests for `timeline.ts` (idempotence, ordering, tombstones,
  unknown types); component tests with the mocked `@ekozhq/sdk` module (the
  project's network seam): first page, scroll-up, live insert, reconnect
  catch-up, optimistic send and failure/retry, read-only composer, composer
  disabled for non-members (`invited`, `joinable`), author labels ("Deleted
  account", "Unknown user"), Markdown sanitisation (raw HTML, `javascript:`
  link), unseen dot, connection banner. `RoomChat` is tested with `room` and
  `capabilities` props; the `RoomGate` + `RoomChat` composition is covered by
  a route-level test.
- Manual check with a running server: SSE across origins (CORS on `/events`),
  since the browser sends the request without custom headers.

## 9. Limitations and open points

- **L1.** An author who left the room is no longer in the members list and shows
  as "Unknown user". Embedding authors in the messages page would fix it
  (rejected for now, see section 3).
- **L2.** No idempotency key on `POST /rooms/:id/messages`: a Retry after a lost
  response can create a duplicate.
- **L3.** Non-members reading a public room (`joinable`) or an invited room
  (`invited`) get history but no live events (feed fan-out is per membership).
- **L4.** Fan-out (S5) is synchronous in the append transaction and proportional to
  the effective members of a room (F10): a very large space makes every message
  send slower. Accepted for this increment; the asynchronous worker is the
  planned evolution (see S5).

## Implementation task breakdown

| Issue | Task | Blocked by |
| ----- | ---- | ---------- |
| [#66](https://github.com/marmotz/ekoz/issues/66) | Server: paginated `GET /rooms/:id/messages` (S1) | - |
| [#67](https://github.com/marmotz/ekoz/issues/67) | Server: `GET /rooms/:id/members` with effective members (S2) | `web-client-rooms` server tasks (prose, not created yet) |
| [#68](https://github.com/marmotz/ekoz/issues/68) | Server: live edit and delete events, `message_deleted` (S3) | - |
| [#69](https://github.com/marmotz/ekoz/issues/69) | Server: `GET /events` starts at the feed head without a cursor (S4) | - |
| [#70](https://github.com/marmotz/ekoz/issues/70) | Server: feed fan-out to effective members (S5) | - |
| [#71](https://github.com/marmotz/ekoz/issues/71) | SDK: messages, sync and `rooms.members` bindings, `RoomEvent` union | #66, #67, #68 |
| [#72](https://github.com/marmotz/ekoz/issues/72) | SDK: `RoomStream` (SSE with fresh-ticket reconnection) | #69, #71 |
| [#73](https://github.com/marmotz/ekoz/issues/73) | Client: `shared/realtime` (stream provider, subscriptions, unseen store) | #72 |
| [#74](https://github.com/marmotz/ekoz/issues/74) | Client: timeline reducer, queries and Markdown allow-list | #71 |
| [#75](https://github.com/marmotz/ekoz/issues/75) | Client: history view, authors and route composition | #71, #74 |
| [#76](https://github.com/marmotz/ekoz/issues/76) | Client: live sync, reconnection catch-up and connection banner | #68, #70, #73, #75 |
| [#77](https://github.com/marmotz/ekoz/issues/77) | Client: composer with optimistic send and read-only states | #75 |
| [#78](https://github.com/marmotz/ekoz/issues/78) | Docs: `docs/technical/web-client-chat.md` | #75, #76, #77 |

All issues carry the label `feature:web-client-chat`. Dependencies on the
`web-client-rooms` tasks (`RoomGate`, the `rooms/$roomId` route, `useMe`, the SDK
`rooms` resource, `UserSummary`, the creator membership) are stated in prose in
#67, #68, #71, #73 and #75 because that feature's issues do not exist yet: add the
`Depends on #<n>` lines once they are created.
