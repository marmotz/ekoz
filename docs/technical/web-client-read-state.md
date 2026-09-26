# Web client read state

## Context

The web client had no notion of "read". The rooms tree showed no unread indicator (the
session-only `unseen` set had no consumer), unread mention counters only ever grew because
nothing sent a read marker, and the rooms list and the invitations were refetched on a
timer-and-focus heuristic because no live channel refreshed them. The `web-client-read-state`
scope closes those three gaps: the client sends a read marker while the user reads, the
rooms tree shows unread badges, other members' read receipts are drawn under the messages,
and the rooms list follows the stream.

The server, protocol and SDK side (markers for effective members, `unreadCount` on
`GET /rooms`, the `receipts` resource and the `receipt_updated` event) is described in
[messages and interactions](../protocol/messages-and-interactions.md#read-markers),
[rooms and permissions](../protocol/rooms-and-permissions.md) and the
[design of the feature](../../backlog/features/web-client-read-state/technical.md), which
holds the findings from the code and is not repeated here. This page records what shipped
in `apps/client-web`. It builds on [web client chat](web-client-chat.md),
[web client rooms](web-client-rooms.md) and [web client members](web-client-members.md).

## Decision

### Active room and reading room

`shared/realtime/active-room.ts` replaces the unseen store. It is an in-memory pair of ids,
readable from any feature without importing another one:

- the **active room**, set by `RoomChat` on mount: the room that is open;
- the **reading room**, set by `useReadMarker`: the room whose newest message is on screen
  in a visible, focused window.

`RealtimeProvider` no longer interprets any event. It connects and disconnects the stream
and resets both ids when the session ends.

### Sending the marker (`features/chat`)

`useReadMarker(roomId, timeline, atBottom)` is mounted by `RoomChat`.

- `MessageList` exposes `onAtBottomChange(boolean)`, derived from the scroll computation it
  already had (pinned to the bottom, timeline attached to the head). `useWindowActive()`
  in `shared/lib` reports `visibilityState === 'visible'` and `document.hasFocus()`.
- Reading means: timeline loaded, at the bottom, window active. While reading, the room is
  published as the reading room.
- The target is the `seq` of the newest confirmed message in `timeline.messages`, never
  `timeline.lastSeq`. The `receipt_updated` caused by our own `PUT` advances `lastSeq`, so
  using it would send a marker for every marker, forever.
- A send waits for one second without change (trailing debounce). A ref keeps the highest
  `seq` already sent, so the same value is never sent twice, like the server, which ignores
  a lower `seq`.
- A failed call is swallowed: the ref is rolled back so the next change sends again. Nothing
  is shown to the user.
- A pending send is flushed when the window is hidden, when the room changes and when the
  chat unmounts (best effort).
- There is no "mark as read" control.

### Unread badges and the live rooms list (`features/rooms`)

`useRoomsLive()` is mounted once by the `_app` layout (the same rule as the unread mentions
hook: a feature hook mounted by the route, since features never import each other). It uses
`useRoomEvents`, `useAccountEvents` and `useReconnected` and writes only the `roomKeys`
caches:

| Source | Action |
|--------|--------|
| `message_created` from someone else, room is not the reading room | `unreadCount + 1` on the list item, capped at 100 |
| `receipt_updated` of the caller, room is the reading room | `unreadCount = 0` on the list item |
| `receipt_updated` of the caller, any other case (other device, partial read) | invalidate the list, coalesced to one per 500 ms |
| `room_created`, `room_updated`, `room_moved`, `room_deleted`, `member_joined`, `member_left`, `member_kicked`, `member_banned`, `role_changed` | invalidate the list, coalesced to one per 500 ms |
| account `invitation_created` | invalidate the invitations |
| account `join_request_resolved` | invalidate the invitations and the list |
| `reconnected` | invalidate both immediately |

Until the caller is known (`useMe`), own and foreign events cannot be told apart, so
`message_created` and `receipt_updated` are ignored.

The `FRESH` override (`staleTime: 10s`, `refetchOnWindowFocus`) is removed from
`roomQueries.list` and `roomQueries.invitations`: both fall back to the global defaults.

Display, in `RoomTree`:

- `UnreadBadge` renders nothing for `null` or `0`, the number up to 99 and `99+` from 100
  (the server caps at 100). Its accessible label is `rooms.sidebar.unread` (French and
  English). It sits next to the mention badge on member and inherited rows.
- `buildRoomTree` gives each node `descendantsUnread`, the sum of the counts of everything
  below it (`null` counts as 0). A collapsed space shows that sum; an expanded space shows
  nothing and its children show their own counts. A space never shows its own count.

### Read receipts (`features/chat`)

- `chatKeys.receipts(roomId)` and `useReceipts(roomId)` load `sdk.receipts.list` when the
  chat mounts. `useReceiptsSync(roomId)` upserts a `receipt_updated` of this room into that
  cache, monotonic on `seq`, and invalidates it on `reconnected`. The cache is removed when
  the chat unmounts, like the timeline, since nothing keeps it current afterwards.
- `features/chat/lib/receipts.ts` is pure. `readersBySeq(messages, markers, memberIds,
  meId)` attaches each other current member to the newest visible message whose `seq` is at
  or below their marker. The caller's own marker, users who are not current members (the
  server keeps the rows of users who left), markers older than the oldest loaded message
  and members with no name left (deleted accounts) are not drawn.
- `MessageList` takes `readersBySeq`, resolves the ids through the existing `useAuthors`,
  and `MessageItem` renders `ReadReceipts` under the message: up to five small
  `UserAvatar` and `+N`, with the names as the accessible label (`chat.receipts.readBy`).

## Alternatives

| Topic | Chosen | Rejected | Why |
|-------|--------|----------|-----|
| Marker target | Newest confirmed message `seq` | `timeline.lastSeq` | Feedback loop through `receipt_updated`. |
| Unread state in the client | Server count on `GET /rooms`, adjusted locally | A client-side unseen set; counting through `/sync` | The set had no consumer and lost the count on reload; `/sync` per room at startup is costly. |
| Local counter updates | Increment on foreign messages, zero on the caller's own receipt for the reading room, otherwise invalidate | Refetch `GET /rooms` on every receipt | A chatty room read live would refetch the whole tree at each window. |
| Where the reading state lives | `shared/realtime/active-room` | Props between features; a feature importing the chat | Features never import each other; `shared` is the meeting point. |
| Coalescing of list refreshes | One refresh per 500 ms, started by the first event | A debounce | A steady flow of events would postpone the refresh indefinitely. |
| Receipts under messages | Marker attached to the newest visible message at or below it | One row per member; a "seen by" popover | Shows progress where the reader stopped, with no extra UI state. |

## Consequences

- **L1.** The reading room is derived from scroll position, focus and visibility. A room
  the user has open but scrolled away from keeps counting foreign messages, and the marker
  is sent when they come back to the bottom.
- **L2.** A marker sent from another device zeroes nothing locally when this device is not
  reading: the list is refetched instead, so the count settles within about 500 ms.
- **L3.** A timeline opened at a message (`at`, detached from the head) sends no marker
  until the user reaches the head again.
- **L4.** A receipt of a member whose marker is past the loaded window of a detached
  timeline is drawn under the last loaded message.
- **L5.** A room the stream does not deliver (for example after losing membership)
  converges on the next invalidation or reload; no behaviour relies on `member_kicked`
  reaching the kicked user.
- **L6.** Direct messages are out of scope; their unread counts belong to
  [`web-client-direct-messages`](../../backlog/features/web-client-direct-messages/overview.md).
