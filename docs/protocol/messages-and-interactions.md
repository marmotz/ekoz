# Messages and interactions

Sending, editing, deleting and pinning messages; reactions; read markers. This
is the wire contract for the messaging surface of an Ekoz server.

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
  "reactions": [
    { "emoji": "👍", "userIds": ["01ARZ3NDEKTSV4RRFFQ69G5FAY", "01ARZ3NDEKTSV4RRFFQ69G5FAX"] }
  ],
  "attachments": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
      "filename": "photo.jpg",
      "contentType": "image/jpeg",
      "sizeBytes": "204800",
      "width": 1920,
      "height": 1080,
      "durationMs": null,
      "hasThumbnail": true
    }
  ],
  "linkPreview": {
    "id": "01ARZ3NDEKTSV4RRFFQ69G5FB0",
    "url": "https://example.com/article",
    "title": "Article title",
    "description": "A short description",
    "siteName": "Example",
    "hasImage": true
  },
  "replyToId": null,
  "editedAt": null,
  "redactedAt": null,
  "hiddenAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`seq` equals the `seq` of the message's `message_created` event; later events about the same message (`message_edited`,
`message_redacted`, reactions, pins, receipts) get their own higher `seq`. A
redacted message has `body: ""` and `redactedAt` set; `hiddenAt` is carried on
the wire but is not set by any current server behaviour (it is reserved for
retention).

`mentions` are the message's [mention targets](#mentions), ordered by first use.
`mentionsMe` is the caller's own relation to the message: `direct` when it
mentions them by name, `collective` when it reaches them through `@all`, a role
or a group, `null` otherwise (and for the author of the message). It is computed
per request, so it is present on REST responses only and never on events.

`reactions` lists the [reactions](#reactions) on the message, one entry per
emoji in order of first reaction, each with the ids of the users who reacted, in
the order they did. A count is `userIds.length`; whether the caller reacted is
derived by the client. A message with no reaction, a new message and a redacted
message have `[]`. `message_created` carries no reactions; clients keep them
current from `reaction_added` and `reaction_removed`, applied idempotently (an
event may replay a reaction already present in a page).

`attachments` lists the message's files, ordered by `position`; `[]` for a
message with none. `linkPreview` is the message's snapshotted link preview, or
`null`. See [Attachments](#attachments) and [Link previews](#link-previews).

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

The info string of a fenced code block (the language written after the opening
fence, e.g. ```` ```ts ````) is preserved verbatim and not validated: it is a
rendering hint that a client may use for syntax highlighting and ignore when it
does not know the value.

## Policy

### `GET /messages/policy`

Public and unauthenticated, never cached (`Cache-Control: no-store`). Tells a
client the limits it can enforce before sending. Read live from the server
settings, so a change made by the owner shows on the next call.

- `200`: `{ bodyMaxLength, editWindow }`.
  - `bodyMaxLength`: integer, the longest `body` the server accepts, counted in
    UTF-16 code units (`messages.body_max_length`). A longer body is rejected
    with `message.body_too_long`.
  - `editWindow`: integer or `null`, the seconds after `createdAt` during which
    an author may edit their own message (`messages.edit_window`); `null` means
    unlimited. It only applies to `room.edit_own`: `room.edit_any` is not bound
    by it. The server stays the arbiter of every edit.

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

## Attachments

Needs `room.post` **and** `room.attach` to add files; `room.attach` alone does
not let a caller post without `room.post`.

- `POST /rooms/:id/messages` accepts `attachments?: uploadId[]` (max
  `attachments.max_per_message`, default `10`): ids of the caller's own,
  `ready`, not-yet-expired uploads (see
  [Files and sharing](files-and-sharing.md#resumable-uploads-tus-10) for
  `POST /uploads`). A
  message needs a `body` or at least one attachment (`message.empty`, `422`).
  Consuming an upload moves its blob reference to the attachment; the `Upload`
  row is deleted, no net effect on the blob's reference count.
- `PATCH /rooms/:id/messages/:messageId` accepts
  `attachments?: { add?: uploadId[], remove?: attachmentId[] }`. Adding is
  **author-only**, needs `room.attach`, and only within `messages.edit_window`
  if set — `room.edit_any` does not extend to attaching new files on someone
  else's message. Removing follows the edit rule (`room.edit_own` /
  `room.edit_any`). The message must still have a body or an attachment
  afterward (`message.empty`, `422`).
- `DELETE /rooms/:id/messages/:messageId/attachments/:attachmentId` removes one
  attachment: `room.delete_own` (the author) or `room.delete_any` (audited as a
  moderation action). Emits `attachment_removed { messageId, attachmentId }`;
  clients handle it like `message_edited` (refetch the message).
- `GET /rooms/:id/files?kind=media|documents&before=&limit=` (`room.read`)
  lists the room's attachments, newest first: `{ items, nextCursor }`. `media`
  is `image/*`, `video/*`, `audio/*`; `documents` is everything else. Hidden and
  redacted messages are excluded. Items add `messageId`, `uploaderId` and
  `createdAt` to the `attachments` item shape above.
- Errors: `message.attachment_limit_exceeded` (`422`),
  `message.attachment_not_found` (`404`), `upload.not_found` (`404`),
  `upload.not_ready` (`409`), `upload.expired` (`410`).
- Files are downloaded through signed URLs (`POST /files/urls` with
  `{ kind: "attachment", id, variant }`), not this endpoint — see
  [Files and sharing](files-and-sharing.md#downloads-through-signed-urls).

## Link previews

Off by default (`link_previews.enabled`); `GET /messages/policy`'s sibling
`GET /auth/policy` exposes it as `linkPreviews`.

- `POST /link-previews { url }` (throttled per user, `link_previews.throttle`)
  fetches (or returns the cached) metadata for a page: `og:*` / `twitter:*` /
  `<title>` / `<meta name=description>`, and a preview image when present.
  `200`: `{ id, url, title, description, siteName, hasImage }`; `204` when the
  page has nothing to preview; `404 link_preview.disabled` when the feature is
  off. The fetcher is SSRF-safe: `http(s)` only, every resolved address must be
  public, redirects are re-checked, response size and time are capped.
- `POST /rooms/:id/messages` accepts `linkPreviewUrl?: string`, one of the
  `http(s)` links in `body` (`link_preview.url_not_in_body`, `422`). The cached
  preview (fetched synchronously once if missing or expired) is copied into the
  message as a snapshot, so a later cache refresh never changes an
  already-sent message.
- `PATCH /rooms/:id/messages/:messageId` accepts
  `linkPreviewUrl?: string | null`: a URL replaces the snapshot (validated the
  same way), `null` removes it, omitting it leaves it unchanged.
- `DELETE` and redaction (user delete, retention delete mode) remove the
  snapshot and release its image.
- The preview image is downloaded through signed URLs, kind `message_preview`
  keyed by the message id (same access rule as attachments); the cache's own
  image (before it is ever used in a message) is kind `preview`, open to any
  authenticated user.

## Sending, editing, deleting

### `POST /rooms/:id/messages`

Needs `room.post` and the room not read-only (or `room.edit_any`).

- Body: `{ body?, replyToId?, mentions?, attachments?, linkPreviewUrl? }`. `body`
  is optional, but a body or at least one attachment is required
  (`message.empty`). `replyToId` must reference a message in the same room (a
  redacted parent still anchors the reply). `mentions` is a list of
  [mention target inputs](#mentions); `attachments` and `linkPreviewUrl` are
  covered in [Attachments](#attachments) and [Link previews](#link-previews).
- `201`: `Message`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  `room.read_only` (`422`), `message.empty` (`422`),
  `message.body_too_long` (`422`),
  `message.body_invalid` (`422`, fails the restricted-Markdown parse),
  `message.reply_not_in_room` (`422`), `message.mention_not_member` (`422`),
  `message.mention_invalid` (`422`), plus the
  [attachment](#attachments) and [link preview](#link-previews) errors,
  validation (`422`).

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
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`, unknown,
  or below the caller's history floor).

### `PATCH /rooms/:id/messages/:messageId`

Needs `room.edit_own` (author, within `messages.edit_window` if set) or
`room.edit_any`. Sets `editedAt`; the previous body is not retained. Emits
`message_edited` with `{ messageId, editedAt }` only — never the previous body.

- Body: `{ body?, mentions?, attachments?, linkPreviewUrl? }` — validated the
  same way as `POST`; the message must still have a body or an attachment
  afterward (`message.empty`).
  - `mentions` absent: the targets are unchanged.
  - `mentions` present: the full new list. A target kept (same `type` and
    `target`) keeps its token and audience, with no re-evaluation. A removed
    target loses its audience. An added target is resolved now, with its
    audience at the `seq` of the `message_edited` event.
  - `attachments`: `{ add?: uploadId[], remove?: attachmentId[] }` — see
    [Attachments](#attachments).
  - `linkPreviewUrl`: a URL replaces the preview, `null` removes it, omitting
    it leaves it unchanged — see [Link previews](#link-previews).
- `200`: `Message`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`, also
  returned for an already-redacted message), `message.empty` (`422`),
  `message.body_too_long` (`422`),
  `message.body_invalid` (`422`), `message.mention_not_member` (`422`),
  `message.mention_invalid` (`422`), plus the
  [attachment](#attachments) and [link preview](#link-previews) errors,
  validation (`422`).

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

- `200`: `{ roomId, messageId, pinnedById, pinnedAt, message }`, `message`
  being the pinned [`Message`](#the-message-object).
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`,
  unknown or redacted message), `message.already_pinned` (`409`).

### `DELETE /rooms/:id/pins/:messageId`

Needs `room.pin`. Emits `pin_removed`.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_pinned` (`404`).

### `GET /rooms/:id/pins`

Needs `room.read`.

- `200`: `{ roomId, messageId, pinnedById, pinnedAt, message }[]`, most
  recently pinned first, each with its embedded [`Message`](#the-message-object)
  (mentions and reactions included). A message with `hiddenAt` set is returned
  as the history returns it; clients filter it. The list is not paginated: a
  room with thousands of pins returns thousands of messages.
- Deleting a message removes its pin without emitting `pin_removed`, so a
  redacted message is never listed here.
- Pins of messages below the caller's
  [history floor](rooms-and-permissions.md#history-floor) are left out.

## Reactions

Reaction routes are not room-scoped in the path (`/messages/:messageId/...`)
— the server resolves the message's room internally to run the `room.react`
check.

### `PUT /messages/:messageId/reactions/:emoji`

Needs `room.react`. Emits `reaction_added`. Not idempotent: reacting twice
with the same emoji is a conflict, not a no-op.

- `204`.
- Errors: `room.permission_denied` (`403`), `message.not_found` (`404`,
  unknown or redacted message), `message.reaction_already_exists` (`409`).

### `DELETE /messages/:messageId/reactions/:emoji`

Removes the caller's own reaction. Emits `reaction_removed`. Deleting a message
removes all its reactions without emitting `reaction_removed`; clients clear them
on `message_deleted` / `message_redacted`.

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
| `message_created` | `{ messageId, body, replyToId, mentions, attachments, linkPreview }` — `mentions` are the [mention targets](#mentions); `attachments` is the raw attachment list (`{ id, filename, contentType, sizeBytes, position }`, not the resolved media metadata); `linkPreview` is the snapshot or `null`; `mentionsMe` is never part of an event |
| `message_edited` | `{ messageId, editedAt }` — never the previous body; clients refetch the message for attachment or link-preview changes too |
| `message_redacted` | `{ reason: "user" \| "retention" }` — this REWRITES the original `message_created` row (same `seq`); it is not a new event |
| `message_deleted` | `{ messageId, messageSeq, reason: "user" \| "retention" }` — the live notification of a deletion, appended with its own `seq`; `messageSeq` is the `seq` of the original (now tombstoned) row |
| `message_hidden` | reserved for retention; no payload shape fixed yet |
| `reaction_added` | `{ messageId, emoji }` |
| `reaction_removed` | `{ messageId, emoji }` |
| `pin_added` | `{ messageId }` |
| `pin_removed` | `{ messageId }` |
| `attachment_removed` | `{ messageId, attachmentId }` — clients refetch the message |
| `receipt_updated` | `{ userId, seq }` |
