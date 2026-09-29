# Web client read state — technical design

Technical design for read markers, unread counters, read receipts and the live
refresh of the rooms list and invitations. It touches `apps/server`
(`conversations` module), `packages/sdk` and `apps/client-web`. Product decisions
are in [overview.md](./overview.md); this page grounds them in the code.

Related: [messages and interactions protocol](../../../../docs/protocol/messages-and-interactions.md#read-markers),
[rooms and permissions protocol](../../../../docs/protocol/rooms-and-permissions.md),
[synchronisation protocol](../../../../docs/protocol/synchronisation.md),
[realtime transport](../../../../docs/technical/realtime-transport.md),
[web client chat](../../../../docs/technical/web-client-chat.md),
[web client rooms](../../../../docs/technical/web-client-rooms.md),
[`web-client-mentions` technical design](../web-client-mentions/technical.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | The SDK has no `receipts` resource. The wire types exist (`ReadMarkerViewDtoDto`, `ReceiptsController_*`), and `receipt_updated` is in `OtherRoomEventType` with `content: unknown`. | [aliases.ts:774](../../../../packages/sdk/src/generated/api/typescript/aliases.ts), [events.ts:63](../../../../packages/sdk/src/types/events.ts) | New `client.receipts` and a typed `ReceiptUpdatedEvent`. |
| F2 | `seq` is allocated for **every** event (`last_seq + 1`), including `receipt_updated`, reactions and membership events. `setReceipt` appends `receipt_updated` after storing the marker, so `lastSeq` is always ahead of a marker that was just set to it. | [event-log.service.ts:60](../../../../apps/server/src/modules/conversations/events/event-log.service.ts), [receipts.service.ts](../../../../apps/server/src/modules/conversations/receipts/receipts.service.ts) | `lastSeq - marker` is not a message count. The count is computed server side on `message_created` rows. |
| F3 | `GET /rooms` is one raw SQL statement (`mine` / `reached` / `reach` / `context` CTEs). `RoomListItem` carries no unread information. `dm` and `group_dm` are excluded. | [rooms.service.ts:94](../../../../apps/server/src/modules/conversations/rooms/rooms.service.ts), [room.view.ts:140](../../../../apps/server/src/modules/conversations/rooms/room.view.ts) | The count is added to that statement and to `RoomListItemSchema`. DMs stay out of scope. |
| F4 | `assertParticipant` accepts an **explicit** `Membership` only (or the server owner). An inherited space member gets `403 room.permission_denied` on both markers endpoints. `web-client-mentions` F5 makes lifting this a prerequisite owned by this feature. | [receipts.service.ts:63](../../../../apps/server/src/modules/conversations/receipts/receipts.service.ts), [mentions technical.md F5](../web-client-mentions/technical.md) | Markers are extended to effective members (S1). |
| F5 | The effective-members query (`DISTINCT ON (user_id)` over `membership` joined to `room_closure`, nearest ancestor first) already exists for `GET /rooms/:id/members`. `Membership.joinedAt` is stored. | [membership.service.ts:130](../../../../apps/server/src/modules/conversations/membership/membership.service.ts), [contract.prisma:517](../../../../apps/server/src/core/prisma/contract.prisma) | S1 and S2 reuse the same closure join. No `joinedAt` is needed on markers. |
| F6 | `receipt_updated` is a `room_event`, fanned out to every effective member (write-time fan-out), so a client sees its own receipts from other devices and everyone else's. Payload: `{ userId, seq }`. | [feed-fanout.service.ts](../../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts), [receipts.service.ts](../../../../apps/server/src/modules/conversations/receipts/receipts.service.ts) | One event drives both the sidebar counter and the avatars. |
| F7 | Account frames are only `invitation_created` and `join_request_resolved`. Accepting or declining an invitation emits nothing. | [membership.service.ts:273](../../../../apps/server/src/modules/conversations/membership/membership.service.ts), `:505`, `:536` | Invitations refresh on those two frames plus local mutations (already invalidate). No server change for the live refresh. |
| F8 | The unseen store is written by `RealtimeProvider` and cleared by `setActiveRoom`, but `useRoomHasUnseen` has **no consumer**: the sidebar renders no dot today. | [unseen-rooms.ts](../../../../apps/client-web/src/shared/realtime/unseen-rooms.ts), [realtime-provider.tsx](../../../../apps/client-web/src/shared/realtime/realtime-provider.tsx) | The set is removed, not migrated. Only the active-room tracking stays. |
| F9 | The rooms list and invitations queries carry `staleTime: 10s` and `refetchOnWindowFocus` because "no live channel refreshes" them. `useAccountEvents` has no consumer. | [queries.ts:8](../../../../apps/client-web/src/features/rooms/api/queries.ts), [use-realtime.ts:62](../../../../apps/client-web/src/shared/realtime/use-realtime.ts) | The override goes away once the live refresh lands. |
| F10 | `MessageList` already computes "pinned to the bottom" (`stickToBottom` ref) but keeps it private. The timeline holds `messages` (ascending `seq`) and `lastSeq`, which advances on **any** applied event. | [message-list.tsx:38](../../../../apps/client-web/src/features/chat/components/message-list.tsx), [timeline.ts](../../../../apps/client-web/src/features/chat/lib/timeline.ts) | The marker must use the newest **message** `seq`, never `timeline.lastSeq` (see C2: the receipt event would advance `lastSeq` and loop). |
| F11 | Client features never import one another (ESLint `boundaries`). Cross-feature code lives in `shared/`; the `_app` layout mounts app-wide hooks. | [mentions technical.md F11](../web-client-mentions/technical.md) | The live hook lives in `features/rooms` and is mounted by the `_app` layout. Chat and rooms communicate through `shared/realtime` (active reading room). |

## 2. Server (`apps/server`, `conversations` module)

### S1. Markers for effective members

`ReceiptsService.assertParticipant` accepts an effective member: an explicit
`Membership` on the room or on one of its ancestor spaces, resolved with the same
closure join as `listMembers` (F5). The server owner exemption stays. `PUT` and `GET`
`/rooms/:id/receipts` both use it. The `read_marker` table and the
`receipt_updated` event are unchanged.

`GET /rooms/:id/receipts` keeps returning one row per user who has a marker. A user
who left keeps a stale row, so the client intersects the result with the members list
(C4). Nothing is deleted on leave.

Error contract unchanged: `room.permission_denied` now means "not an effective member".

### S2. `unreadCount` on `GET /rooms`

`RoomListItem` gains `unreadCount: number | null`:

- `null` for `access: context` (the caller has no membership there, no marker possible).
- an integer in `0..100` for `member` and `inherited`. `100` means "100 or more"; the
  client displays `99+`.

Computation, inside the existing statement:

- `reach` carries `joined_at` of the membership that gives the role (own membership at
  depth 0, else the nearest ancestor's). `mine` and `reached` add the column.
- A `LEFT JOIN read_marker rm ON rm.room_id = r.id AND rm.user_id = <me>`.
- A `LEFT JOIN LATERAL` counting, capped, `room_event` rows of the room with
  `type = 'message_created'`, `sender_id IS DISTINCT FROM <me>`,
  `created_at >= reach.joined_at` and `(rm.seq IS NULL OR seq > rm.seq)`:

  ```sql
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM room_event e
      WHERE e.room_id = r.id AND e.type = 'message_created'
        AND e.sender_id IS DISTINCT FROM ${actor.userId}
        AND e.created_at >= reach.joined_at
        AND (rm.seq IS NULL OR e.seq > rm.seq)
      LIMIT 100
    ) capped
  ) unread ON reach.room_id IS NOT NULL
  ```

Notes:

- No marker means "since the caller joined": no artificial marker is written on
  membership creation, so there is no backfill, no new call site, and no fake
  "has read" avatar for a new member. Rejoining resets `joined_at`, which also
  discards a stale marker from a previous membership.
- A redacted message stops being `message_created` (its row is rewritten, same
  `seq`), so it is no longer counted. `message_deleted` rows are never counted.
- The primary key `(room_id, seq)` gives the range scan when a marker exists. For a
  room with no marker the scan relies on `(room_id, created_at)`. The `LIMIT 100`
  bounds the work by matching rows, not by room history.
- The lateral sub-select is written so `dm` / `group_dm` can reuse it later
  (owned by [`web-client-direct-messages`](../web-client-direct-messages/overview.md)).

### S3. Protocol, OpenAPI, tests

- `RoomListItemSchema` gets `unreadCount` (`z.number().int().min(0).max(100).nullable()`).
  Regenerate: `openapi:emit`, then `bun run generate`.
- [rooms-and-permissions.md](../../../../docs/protocol/rooms-and-permissions.md) documents
  `unreadCount` under `GET /rooms`; [messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md#read-markers)
  states that markers are available to effective members. Additive change, recorded in
  [docs/protocol/CHANGELOG.md](../../../../docs/protocol/CHANGELOG.md).
- e2e: extend `conversations-reactions-receipts.e2e-spec.ts` (inherited member can `PUT`
  and `GET`, non-member still `403`) and `conversations-rooms.e2e-spec.ts` (counts:
  no marker, marker mid-history, own messages excluded, redacted excluded, cap at 100,
  `null` on `context`, rejoin).

## 3. SDK (`packages/sdk`)

- `client.receipts`: `set(roomId, seq)` (`PUT /rooms/:id/receipt`, body `{ seq }`) and
  `list(roomId)` (`GET /rooms/:id/receipts`). `wire.ts` re-exports `ReadMarkerViewDtoDto`
  as `ReadMarker`.
- `events.ts`: `ReceiptUpdatedEvent` (`type: 'receipt_updated'`, `content: { userId,
  seq }`), added to the `RoomEvent` union and removed from `OtherRoomEventType`.
- `RoomListItem` picks up `unreadCount` from the regeneration.
- A changeset for `@ekozhq/sdk` (minor: new resource and field).
- Tests: `receipts.test.ts` (paths, body, decoding), type test on the event union.

## 4. Web client (`apps/client-web`)

### C1. Active room, not unseen rooms

`shared/realtime/unseen-rooms.ts` becomes `active-room.ts`: it keeps `getActiveRoom`
and `setActiveRoom`, and adds `getReadingRoom` / `setReadingRoom` (the room whose
newest message is on screen in a focused window, C2). `markUnseen`, `markSeen`,
`useRoomHasUnseen` and `resetUnseenRooms` disappear (F8), and `RealtimeProvider` no
longer interprets events: it only opens and closes the stream and resets the active
and reading rooms.

### C2. Sending the marker (`features/chat`)

- `MessageList` reports `onAtBottomChange(boolean)` from its existing scroll
  computation (F10).
- `useWindowActive()` in `shared/lib`: `document.visibilityState === 'visible'` and
  `document.hasFocus()`, updated on `visibilitychange`, `focus` and `blur`.
- `useReadMarker(roomId, timeline, atBottom)` in `features/chat/hooks`:
  - reading = timeline loaded, `atBottom`, window active. It calls `setReadingRoom`
    accordingly.
  - target = `seq` of the newest **confirmed message** in `timeline.messages`. It is
    never `timeline.lastSeq`: the `receipt_updated` triggered by the `PUT` advances
    `lastSeq`, which would send another `PUT` forever.
  - when reading and `target > lastSent` (a ref, monotonic, like the server), it waits
    1 s of quiet (trailing debounce) then calls `sdk.receipts.set(roomId, target)`.
    A failure is swallowed and retried on the next change; nothing is shown to the user.
  - unmount or window hidden flushes a pending send (best effort).
- No "mark as read" control (overview).

### C3. Unread counters and live refresh (`features/rooms`)

`useRoomsLive()` in `features/rooms/hooks`, mounted once by the `_app` layout (same
mounting rule as the mentions live hook, F11). It uses `useRoomEvents`,
`useAccountEvents` and `useReconnected` from `shared/realtime` and writes only the
`roomKeys` caches:

| Source | Action |
|---|---|
| `message_created`, sender is not me, room is not the reading room | `unreadCount + 1` on that list item, capped at 100 |
| `receipt_updated`, `userId` is me, room is the reading room | `unreadCount = 0` on that list item |
| `receipt_updated`, `userId` is me, any other case (other device, partial read) | invalidate `roomKeys.list()`, debounced 500 ms |
| `room_created`, `room_updated`, `room_moved`, `room_deleted`, `member_joined`, `member_left`, `member_kicked`, `member_banned`, `role_changed` | invalidate `roomKeys.list()`, debounced 500 ms |
| account `invitation_created` | invalidate `roomKeys.invitations()` |
| account `join_request_resolved` | invalidate `roomKeys.invitations()` and `roomKeys.list()` |
| `reconnected` | invalidate both |

"Me" comes from `useMe`. Until it is known, own and foreign events cannot be told
apart, so `message_created` and `receipt_updated` are ignored (as `RealtimeProvider`
does today).

Once this hook is in place, the `FRESH` override in `roomQueries.list` and
`roomQueries.invitations` is deleted (F9): the queries fall back to the global defaults.
A room the stream does not deliver (for example after losing membership) still
converges on the next invalidation or reload; this is not verified for `member_kicked`,
so no behaviour relies on receiving it.

Display, in `RoomTree`:

- `UnreadBadge` (`shared/ui` or `features/rooms/components`): renders nothing for `null`
  or `0`, the number for `1..99`, `99+` from `100`. Accessible name through an i18n key
  (`rooms.sidebar.unread`, French and English).
- A collapsed space shows the sum of the `unreadCount` of its descendants (computed in
  `buildRoomTree` from the loaded tree, `null` counts as 0); expanded, it shows none and
  its children show their own. Space rows never show their own count (spaces hold no
  message).

### C4. Read receipts (`features/chat`)

- `chatKeys.receipts(roomId)` and `useReceipts(roomId)`: `sdk.receipts.list(roomId)`,
  loaded when the chat mounts.
- `useReceiptsSync(roomId)` mounted by `RoomChat`: `receipt_updated` for this room patches
  the cached list (`userId` upsert, monotonic on `seq`); `reconnected` invalidates it.
- `features/chat/lib/receipts.ts` (pure): `readersBySeq(messages, markers, memberIds, meId)`
  returns `Map<messageSeq, userId[]>`. For each marker of a current member other than
  the caller, the reader is attached to the newest visible message with
  `seq <= marker.seq`. A marker older than the oldest loaded message is not drawn.
- `MessageList` takes `readersBySeq`; `MessageItem` renders `ReadReceipts` under the
  message: up to 5 `UserAvatar` (small) and `+N`, the full list of names as its
  accessible label. Authors are resolved through the existing `useAuthors` members data.
- Members with `displayName: null` (deleted accounts) are skipped.

## 5. Alternatives considered

| Decision | Retained | Rejected | Why |
|---|---|---|---|
| Unread count source | Server field on `GET /rooms` (`unreadCount`) | Client counting through `/sync`; client `seq` gap | `/sync` per room at startup is costly and capped; the `seq` gap counts non-message events and is off by one after every own `PUT` (F2). |
| No-marker baseline | `created_at >= joined_at` in the query | Write a marker at membership creation | It needs five creation sites plus a backfill, and would show a new member as having "read" the last message. |
| Marker for inherited members | Extend `assertParticipant` to effective members | Keep explicit-only | Needed by `web-client-mentions` (F4) and for counters on inherited rooms. |
| Cap | Server caps at 100, client shows `99+` | Exact count | Constant cost on busy rooms. |
| Marker target | Newest confirmed message `seq` | `timeline.lastSeq` | Feedback loop through `receipt_updated` (F10). |
| Local counter updates | Increment on foreign messages, zero on own reading receipt, otherwise invalidate | Refetch `GET /rooms` on every receipt | A chatty room read live would refetch the whole tree at each debounce window. |
| Live refresh transport | Existing room events plus the two account frames | New account frames for every list change | The room events already reach effective members (F6); the server needs no change. |

## 6. Dependencies and order

1. S1 and the SDK `receipts` resource first: they unblock
   [`web-client-mentions`](../web-client-mentions/technical.md) (F5, section 6).
2. S2 and S3 (server count, protocol, OpenAPI).
3. Client: C1, then C2 and C3 (independent), then C4.

`web-client-direct-messages` reuses the S2 sub-select for its own list. `notifications`
may later decide whether a muted room shows a badge; not handled here.

## 7. Tests

- Server: e2e listed in S3. Unit test for the view mapper (`unreadCount` nullable).
- SDK: resource and event typing (section 3).
- Client (Vitest):
  - `active-room.test.ts` (replaces `unseen-rooms.test.tsx`); `realtime-provider.test.tsx`
    updated (no unseen behaviour).
  - `use-read-marker.test.tsx`: no send while scrolled up, unfocused or before load; one
    trailing send per quiet window; never re-sends the same `seq`; targets the message
    `seq`, not `lastSeq`; flush on unmount; failure swallowed.
  - `use-rooms-live.test.tsx`: every row of the C3 table, including the "me not known" case.
  - `build-room-tree.test.ts`: collapsed-space sum.
  - `unread-badge.test.tsx`: `null`, `0`, `5`, `99`, `100` (`99+`).
  - `receipts.test.ts` (pure): newest visible message rule, own marker excluded, left
    members excluded, marker older than the window, several readers on one message.
  - `room-chat.test.tsx`: avatars under the right message and live update on `receipt_updated`.
  - `queries.test.ts` (rooms): the query options no longer carry the `FRESH` override.
- Docs: `docs/technical/web-client-read-state.md` (this design as shipped),
  `docs/technical/README.md` index, `web-client-chat.md` (unseen store replaced),
  `web-client-rooms.md` (freshness override removed).

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-read-state`, in dependency order.

| Issue | Task | Depends on |
| ----- | ---- | ---------- |
| [#218](https://github.com/marmotz/ekoz/issues/218) | Server: read markers for effective members (S1) | none |
| [#219](https://github.com/marmotz/ekoz/issues/219) | Server: `unreadCount` on `GET /rooms`, protocol, OpenAPI (S2, S3) | #218 |
| [#220](https://github.com/marmotz/ekoz/issues/220) | SDK: `receipts` resource, `receipt_updated` event, `unreadCount` (section 3) | #218, #219 |
| [#221](https://github.com/marmotz/ekoz/issues/221) | Client: replace the unseen store with active and reading room (C1) | none |
| [#222](https://github.com/marmotz/ekoz/issues/222) | Client: send the read marker while reading (C2) | #220, #221 |
| [#223](https://github.com/marmotz/ekoz/issues/223) | Client: unread badges and live rooms list (C3) | #220, #221 |
| [#224](https://github.com/marmotz/ekoz/issues/224) | Client: read receipt avatars under messages (C4) | #220 |
| [#225](https://github.com/marmotz/ekoz/issues/225) | Docs: `docs/technical/web-client-read-state.md` and related pages | #218, #219, #222, #223, #224 |
