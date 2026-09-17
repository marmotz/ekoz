# Messages and interactions

Sending, editing, deleting and pinning messages; reactions; read markers. This
is the wire contract for `apps/server`'s `conversations` feature, the messages
slice (issues #7-#9) — a mismatch between this page and `apps/server` is a bug,
fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)). **Draft ahead of
implementation**: issues #7-#9 have not landed yet (see
[Spaces, rooms, roles and permissions](rooms-and-permissions.md) for what has);
this page transcribes the settled design from
`backlog/features/conversations/technical.md` §11-§12 and §14 so clients can be
built against it, and gets corrected against the real server the day it ships.

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)), namespace
  `room.*`.
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
  "mentions": ["01ARZ3NDEKTSV4RRFFQ69G5FAY"],
  "replyToId": null,
  "editedAt": null,
  "redactedAt": null,
  "hiddenAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`seq` equals the `seq` of the message's `message_created` event (technical.md
§10); later events about the same message (`message_edited`,
`message_redacted`, `message_hidden`, reactions, pins, receipts) get their own
higher `seq`. `authorId` resolves to "Deleted account" if the author's account
is later deleted (identity-and-profiles' forward contract); it does not become
`null`. A redacted message has `body: ""` and `redactedAt` set; a hidden
message keeps its `body` (visible only out-of-band) with `hiddenAt` set.

## Restricted Markdown

`body` is a restricted Markdown source, at most `messages.body_max_length`
characters (server config; not yet exposed to clients). Allowed constructs:
emphasis, strong, strikethrough, inline code, fenced code, blockquote,
ordered/unordered lists, links (`http(s)` and `mailto` only), hard/soft
breaks. Disallowed: raw HTML, images, headings, tables, autolinked bare URLs
beyond a safe linkifier. The server validates the source parses to only
allowed nodes and stores the source verbatim; clients render with the same
allowlist, so a client-side renderer must implement the identical restriction
(the source is not pre-sanitised HTML).

**Mentions** are structured, not parsed from the body: the client sends
`mentions: [userId]` alongside `body`; the server verifies each mentioned user
is resolvable, stores them, and echoes them in `Message.mentions` and the
`message_created` event. The rendered `@name` inside `body` is cosmetic — the
structured list is authoritative and drives notifications.

## Sending, editing, deleting

### `POST /rooms/:id/messages`

Needs `room.post` and the room not read-only (or `room.edit_any`).

- Body: `{ body, replyToId?, mentions? }`. `replyToId` must reference a message
  in the same room (a redacted/hidden parent still anchors the reply, shown as
  "deleted message").
- `201`: `Message`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  validation (`422`, includes a `body` that fails the restricted-Markdown
  parse).

### `PATCH /rooms/:id/messages/:messageId`

Needs `room.edit_own` (author, within `messages.edit_window` if set) or
`room.edit_any`. Sets `editedAt`; the previous body is not retained. Emits
`message_edited` with `{ editedAt }` only — never the previous body.

- Body: `{ body }`.
- `200`: `Message`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  validation (`422`).

### `DELETE /rooms/:id/messages/:messageId`

Needs `room.delete_own` or `room.delete_any`. Sets `redactedAt` /
`redactedById`, clears `body`, cascades: removes reactions, mentions and pins
on the message. Emits `message_redacted`.

- `204`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`).

## Pins

### `PUT /rooms/:id/pins/:messageId`

Needs `room.pin`. Emits `pin_added`.

- `204`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`).

### `DELETE /rooms/:id/pins/:messageId`

Needs `room.pin`. Emits `pin_removed`.

- `204`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`).

### `GET /rooms/:id/pins`

Needs `room.read`.

- `200`: `Message[]`, pinned messages in pin order.

## Reactions

### `PUT /messages/:messageId/reactions/:emoji`

Needs `room.react`. Emits `reaction_added`. Idempotent: reacting twice with the
same emoji is a no-op.

- `204`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`, unknown
  message).

### `DELETE /messages/:messageId/reactions/:emoji`

Removes the caller's own reaction. Emits `reaction_removed`.

- `204`.
- Errors: `room.not_found` (`404`).

## Read markers

One row per `(room, user)`: the highest contiguous `seq` the user has read.
Visible to every room participant (not just the reader), per the functional
spec.

### `PUT /rooms/:id/receipt`

Needs to be a member. Monotonic: a lower `seq` than the caller's current
marker is ignored (not an error). Emits `receipt_updated { userId, seq }` to
the room.

- Body: `{ seq }`.
- `204`.
- Errors: `room.not_found` (`404`), validation (`422`).

### `GET /rooms/:id/receipts`

Needs `room.read`.

- `200`: `{ userId, seq }[]`, one entry per member with a marker.

## Room events

New payloads on top of
[Spaces, rooms, roles and permissions](rooms-and-permissions.md#room-events):

| type | payload |
|---|---|
| `message_created` | `{ authorId, body, replyToId, mentions }` |
| `message_edited` | `{ editedAt }` — never the previous body |
| `message_redacted` | `{ reason?: "retention" }` — present when the retention worker (not this issue set) produced the tombstone |
| `message_hidden` | `{}` |
| `reaction_added` | `{ userId, emoji }` |
| `reaction_removed` | `{ userId, emoji }` |
| `pin_added` | `{ messageId }` |
| `pin_removed` | `{ messageId }` |
| `receipt_updated` | `{ userId, seq }` |
