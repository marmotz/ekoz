# Messages and interactions

Sending, editing, deleting and pinning messages; reactions; read markers. This
is the wire contract for `apps/server`'s `conversations` feature, the messages
slice (issues #7-#9) — a mismatch between this page and `apps/server` is a bug,
fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)).

## Conventions

- Error responses are `application/problem+json` with a stable `code`,
  namespace `message.*` (`room.*` for room-level guards like read-only or
  permission checks).
- Timestamps: UTC ISO-8601. Identifiers: ULID. `Message.seq` is a 64-bit
  integer, serialised as a decimal **string** — see
  [Spaces, rooms, roles and permissions](rooms-and-permissions.md) for why.

## The `Message` object

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "roomId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "seq": "42",
  "authorId": "01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "body": "**hello** _world_",
  "mentions": [
    { "type": "user", "target": "01ARZ3NDEKTSV4RRFFQ69G5FAY", "token": "@bob/ekoz.example.com" }
  ],
  "mentionsMe": "direct",
  "replyToId": null,
  "editedAt": null,
  "redactedAt": null,
  "hiddenAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`seq` equals the `seq` of the message's `message_created` event (technical.md
§10); later events about the same message (`message_edited`,
`message_redacted`, reactions, pins, receipts) get their own higher `seq`. A
redacted message has `body: ""` and `redactedAt` set; `hiddenAt` is carried on
the wire but not yet set by anything (the retention worker that sets it is
issue #12).

`mentions` are the message's [mention targets](#mentions), ordered by first use.
`mentionsMe` is the caller's own relation to the message: `direct` when it
mentions them by name, `collective` when it reaches them through `@all`, a role
or a group, `null` otherwise (and for the author of the message). It is computed
per request, so it is present on REST responses only and never on events.

## Restricted Markdown

`body` is a restricted Markdown source, at most `messages.body_max_length`
characters (server config). Allowed constructs: emphasis, strong,
strikethrough, inline code, fenced code, blockquote, ordered/unordered lists,
links (`http(s)` and `mailto` only), hard/soft breaks. Disallowed: raw HTML,
images, headings, tables. The server parses the source with a `remark`
pipeline (`remark-gfm` for strikethrough) and rejects any node type outside
that allowlist, or a link whose scheme isn't `http:`, `https:` or `mailto:`;
it stores the source verbatim. A bare URL written without `[]()` syntax is
still linkified by `remark-gfm` and passes through like any other link — the
scheme check is what actually keeps rendering safe, not whether the client
typed brackets.

## Mentions

Mentions are structured, not parsed from the body: the client sends the
**targets** it wants to mention next to `body`, and the server resolves each one
into a frozen token and a frozen audience.

A target has a `type`:

| `type` | Input | `target` on the wire | `token` | Audience |
|---|---|---|---|---|
| `user` | `{ type: "user", userId }` | the user id | `@name/server` (the user's identifier) | that user |
| `all` | `{ type: "all" }` | `null` | `@all` | every effective member |
| `role` | `{ type: "role", role }` | the role name | `@<role>` | effective members whose effective role is that role |
| `group` | `{ type: "group", groupId }` | the group id | `@<group name>` | group members who are effective members |

- **Effective members** are those of the room and of its ancestor spaces, the same
  set as `GET /rooms/:id/members`. A `user` target must be one of them
  (`message.mention_not_member`), so a member of the parent space can be
  mentioned in a channel they never joined.
- `all`, `role` and `group` targets are only allowed in `channel` rooms
  (`message.mention_invalid` in a `dm` or `group_dm`). A `group` must be defined
  on the room or one of its ancestors (`message.mention_invalid`). A `user`
  without an identifier cannot be mentioned (`message.mention_invalid`).
- At most 100 targets; duplicates collapse.
- The **token** is the literal text standing for the target in `body`. The
  server freezes it when the target is created, so a later rename or deletion
  never breaks the association. Clients locate a mention by matching its token in
  the body. The body is not checked for the tokens: a target whose token does not
  appear still concerns its audience.
- The **audience** is who the message concerns. It is resolved when the target is
  created, then frozen: someone who joins later is not added. The author is never
  in their own audience.
- A target added by an edit gets its audience at the `seq` of the
  `message_edited` event, so it counts as new for a reader whose read marker is
  already past the message.

## Sending, editing, deleting

### `POST /rooms/:id/messages`

Needs `room.post` and the room not read-only (or `room.edit_any`).

- Body: `{ body, replyToId?, mentions? }`. `replyToId` must reference a message
  in the same room (a redacted parent still anchors the reply). `mentions` is a
  list of [mention target inputs](#mentions).
- `201`: `Message`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  `room.read_only` (`422`), `message.body_too_long` (`422`),
  `message.body_invalid` (`422`, fails the restricted-Markdown parse),
  `message.reply_not_in_room` (`422`), `message.mention_not_member` (`422`),
  `message.mention_invalid` (`422`), validation (`422`).

### `GET /rooms/:id/messages`

Paginated history, newest page first by default. Needs `room.read`.

- Query: `?before=&after=&around=&limit=`. At most one of `before`, `after` and
  `around` (`422` otherwise); each is a decimal `seq`. `limit` defaults to `50`
  and is capped at `messages.max_page` (default `100`) regardless of what is
  requested. Paging uses a `seq`, not an opaque cursor, because it walks the
  room's log.
  - none, or `before`: the newest `limit` messages with `seq < before` (all
    messages when `before` is omitted). `before` is exclusive.
  - `after`: the oldest `limit` messages with `seq > after`.
  - `around`: `floor(limit / 2)` messages with `seq < around`, then up to
    `limit - floor(limit / 2)` messages with `seq >= around`. Fewer are returned
    when the room has fewer on a side.
- `200`: `{ items: Message[], lastSeq: string, hasMore: boolean, hasMoreNewer: boolean }`.
  `items` are ordered by `seq` **ascending** inside the page. Redacted messages
  are included as tombstones (`redactedAt` set, `body: ""`). `hasMore` is `true`
  when older messages exist, `hasMoreNewer` when newer ones do (always `false`
  for the default and `before` pages, which end at the newest message).
  `mentions` and `mentionsMe` are filled for every item.
- `lastSeq` is the room's `Room.lastSeq`, read **before** the messages in the
  same request: the returned messages are at least as recent as `lastSeq`, so a
  client that then applies events with `seq > lastSeq` (`GET /sync`,
  `GET /events`) is safe and idempotent.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  validation (`422`, e.g. a non-numeric `seq`, more than one of `before` /
  `after` / `around`, or a `limit` below `1`).

`seq` counts every room event (joins, reactions, pins, ...), so a page may hold
fewer than `limit` messages only at an end of the room: the window is taken over
messages, not over events.

### `GET /rooms/:id/messages/:messageId`

Needs `room.read`.

- `200`: `Message`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`).

### `PATCH /rooms/:id/messages/:messageId`

Needs `room.edit_own` (author, within `messages.edit_window` if set) or
`room.edit_any`. Sets `editedAt`; the previous body is not retained. Emits
`message_edited` with `{ messageId, editedAt }` only — never the previous body.

- Body: `{ body, mentions? }` — validated the same way as `POST`.
  - `mentions` absent: the targets are unchanged.
  - `mentions` present: the full new list. A target kept (same `type` and
    `target`) keeps its token and audience, with no re-evaluation. A removed
    target loses its audience. An added target is resolved now, with its
    audience at the `seq` of the `message_edited` event.
- `200`: `Message`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`, also
  returned for an already-redacted message), `message.body_too_long` (`422`),
  `message.body_invalid` (`422`), `message.mention_not_member` (`422`),
  `message.mention_invalid` (`422`), validation (`422`).

### `DELETE /rooms/:id/messages/:messageId`

Needs `room.delete_own` (author) or `room.delete_any`. Sets `redactedAt` /
`redactedById`, clears `body`, cascades: removes `reaction`, mention targets and their
audience, and `message_pin` rows. Rewrites the original `message_created` room_event
into a tombstone (same `seq`, `type: "message_redacted"`), so the deleted body
never lingers in the append-only log, **and** appends a `message_deleted` event
(new `seq`, fanned out, served by `GET /sync` and `GET /events`) so connected
clients learn about the deletion. In the same transaction the account feed rows
that mirrored the original `message_created` are rewritten to the same
tombstone, so `GET /events` cannot replay the deleted body. Retention deletions
go through the same path and emit one `message_deleted` per message.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`, also
  returned for an already-deleted message — delete is not idempotent).

## My mentions

Both endpoints read the audience frozen when each target was created. They skip
redacted and hidden messages, deleted rooms and rooms the caller can no longer
read, and cover every room type.

### `GET /me/mentions/unread`

Unread mention counters per room.

- `200`: `{ items: Array<{ roomId, direct, collective }> }`, ordered by
  `roomId`, only rooms with at least one unread mention. A message counts once,
  as `direct` when any of its audience rows for the caller comes from a `user`
  target, otherwise as `collective`. Unread means `seq` above the caller's read
  marker in the room (`0` without a marker).

### `GET /me/mentions`

The messages that concern the caller, most recent mention first. A mention
added by an edit counts from the edit.

- Query: `?cursor=&limit=`. `limit` defaults to `30` and is capped at `100`.
  `cursor` is an opaque token from a previous response's `nextCursor`; a
  malformed one is ignored.
- `200`: `{ items: Array<{ message: Message, room: { id, type, name, parentId }, mentionsMe, unread }>, nextCursor: string | null }`.
  `mentionsMe` is `direct` or `collective`. Read items stay listed with
  `unread: false`.
- Errors: validation (`422`, e.g. a `limit` below `1`).

## Pins

### `PUT /rooms/:id/pins/:messageId`

Needs `room.pin`. Emits `pin_added`.

- `200`: `{ roomId, messageId, pinnedById, pinnedAt }`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`),
  `message.already_pinned` (`409`).

### `DELETE /rooms/:id/pins/:messageId`

Needs `room.pin`. Emits `pin_removed`.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_pinned` (`404`).

### `GET /rooms/:id/pins`

Needs `room.read`.

- `200`: `{ roomId, messageId, pinnedById, pinnedAt }[]`, most recently pinned
  first. Fetch each `Message` separately (`GET
  /rooms/:id/messages/:messageId`) if the body is needed — this endpoint does
  not join it.

## Reactions

Reaction routes are not room-scoped in the path (`/messages/:messageId/...`)
— the server resolves the message's room internally to run the `room.react`
check.

### `PUT /messages/:messageId/reactions/:emoji`

Needs `room.react`. Emits `reaction_added`. Not idempotent: reacting twice
with the same emoji is a conflict, not a no-op.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`,
  unknown message), `message.reaction_already_exists` (`409`).

### `DELETE /messages/:messageId/reactions/:emoji`

Removes the caller's own reaction. Emits `reaction_removed`.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`),
  `message.reaction_not_found` (`404`).

## Read markers

One row per `(room, user)`: the highest `seq` the user has read. Available to
the room's effective members (an explicit `Membership` on the room or on one of
its ancestor spaces) and visible to all of them, per the functional spec —
not gated on `room.read` (a `public` room's non-member default-role reader does
not get this). A user who left keeps a stale row; clients filter by the current
members.

### `PUT /rooms/:id/receipt`

Needs to be an effective member. Monotonic: a `seq` lower than the caller's current
marker is ignored (not an error, and the previous marker is returned
unchanged). Emits `receipt_updated { userId, seq }` to the room.

- Body: `{ seq }` — decimal string.
- `200`: `{ roomId, userId, seq, updatedAt }`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`, not an
  effective member), validation (`422`).

### `GET /rooms/:id/receipts`

Needs to be an effective member.

- `200`: `{ roomId, userId, seq, updatedAt }[]`, one entry per user with a
  marker.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`, not an
  effective member).

## Room events

New payloads on top of
[Spaces, rooms, roles and permissions](rooms-and-permissions.md#room-events).
`senderId` on the event row already carries the actor (author, editor,
deleter, reactor, pinner); `content` only ever carries the delta.

| type | payload |
|---|---|
| `message_created` | `{ messageId, body, replyToId, mentions }` — `mentions` are the [mention targets](#mentions); `mentionsMe` is never part of an event |
| `message_edited` | `{ messageId, editedAt }` — never the previous body |
| `message_redacted` | `{ reason: "user" \| "retention" }` — this REWRITES the original `message_created` row (same `seq`); it is not a new event |
| `message_deleted` | `{ messageId, messageSeq, reason: "user" \| "retention" }` — the live notification of a deletion, appended with its own `seq`; `messageSeq` is the `seq` of the original (now tombstoned) row |
| `message_hidden` | reserved for the retention worker (issue #12); no payload shape fixed yet |
| `reaction_added` | `{ messageId, emoji }` |
| `reaction_removed` | `{ messageId, emoji }` |
| `pin_added` | `{ messageId }` |
| `pin_removed` | `{ messageId }` |
| `receipt_updated` | `{ userId, seq }` |
