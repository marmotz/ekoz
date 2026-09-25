# Web client timeline system events — technical design

Technical design across `apps/server`, `packages/sdk` and `apps/client-web`. Product
decisions are in [overview.md](./overview.md); this page grounds them in the code.

Related: [rooms and permissions protocol](../../../docs/protocol/rooms-and-permissions.md),
[messages and interactions protocol](../../../docs/protocol/messages-and-interactions.md),
[web client chat](../../../docs/technical/web-client-chat.md),
[event log and ordering](../../../docs/technical/event-log-and-ordering.md),
[`web-client-room-moderation` design](../web-client-room-moderation/technical.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | The actor of every membership event is already in `room_event.senderId` (`actor.userId`), and the protocol says so. The SDK `RoomEventBase` exposes `senderId`. | [membership.service.ts:554-632](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md) (Room events), [events.ts](../../../packages/sdk/src/types/events.ts) | The `actorId` in the overview is redundant. No payload change (D1). |
| F2 | The timeline history comes from `GET /rooms/:id/messages`, which reads the `Message` table only. Non-message events reach the client only through the live stream and `/sync`. | [messages.service.ts:215](../../../apps/server/src/modules/conversations/messages/messages.service.ts) | Without a server change, system lines would never show on open (D2). |
| F3 | `applyRoomEvent` advances `lastSeq` for every event and drops the ones it does not know (`default` branch). `RoomEvent` types the six membership events as `UnknownRoomEvent` (`content: unknown`). | [timeline.ts:143](../../../apps/client-web/src/features/chat/lib/timeline.ts), [events.ts](../../../packages/sdk/src/types/events.ts) | Typed event interfaces in the SDK, a new branch in the reducer. |
| F4 | Author names come from `['chat','members',roomId]`. A user who left, was kicked or banned is no longer in it (limit L1), and `useAuthors` shows "Unknown user". That list is invalidated on `member_joined` only. | [use-authors.ts](../../../apps/client-web/src/features/chat/hooks/use-authors.ts), [use-timeline-sync.ts](../../../apps/client-web/src/features/chat/hooks/use-timeline-sync.ts) | The target of a departure is exactly the user the list no longer holds (D3). |
| F5 | `GET /rooms/:id/members` items carry `user: { id, identifier, displayName, avatarUrl }` (`Member['user']`). Deleted accounts have a `null` `displayName`. | [use-authors.ts](../../../apps/client-web/src/features/chat/hooks/use-authors.ts) | Reuse this shape as the user summary of the new page field. |
| F6 | The older-page cursor is the `seq` of the oldest loaded message. The unseen dot only reacts to `message_created`. | [use-timeline.ts](../../../apps/client-web/src/features/chat/hooks/use-timeline.ts), [web-client-chat.md](../../../docs/technical/web-client-chat.md) (Stream ownership) | System lines add nothing to unread by construction (D6). |
| F7 | The current user id is `useMe().data.id`. | [use-me.ts](../../../apps/client-web/src/shared/sdk/use-me.ts), [account.view.ts:12](../../../apps/server/src/modules/identity/accounts/account.view.ts) | "You" wording needs no new source (D5). |
| F8 | The kicked or banned target never receives the event on the stream (membership deleted before the fan-out); leaving a `dm` emits no `member_left`. | [web-client-room-moderation technical.md](../web-client-room-moderation/technical.md) F2, [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md) | The target sees its own kick line only through history if it still can read the room; otherwise it is handled by the moderation design. |

## 2. Decisions

### D1. No protocol change on the payloads

`senderId` is the actor. The moderation payloads stay `{ userId }`, `{ userId, reason }`,
`{ userId, role }`. The overview decision on `actorId` is corrected accordingly.

### D2. History: extend `GET /rooms/:id/messages`

Chosen. The response gains two fields, `events` and `users`:

```
{ items: Message[], lastSeq, hasMore,
  events: SystemEvent[],   // membership events inside the page window
  users: UserSummary[] }   // profiles cited by those events
```

- `SystemEvent = { seq, type, senderId, content, createdAt }` for
  `member_joined | member_left | member_kicked | member_banned | member_unbanned | role_changed`.
- **Window.** The page window over messages is unchanged. Events are the ones with
  `floor <= seq < ceiling`, where `ceiling` is `before` (or `lastSeq + 1` on the newest
  page) and `floor` is the `seq` of the oldest returned message when `hasMore`, else `0`.
  Two consecutive pages therefore never overlap or leave a gap, and the existing
  `before` cursor keeps working.
- **Ban reason.** `member_banned.content.reason` is stripped from `events` (product
  decision: never shown), so it does not travel to non-moderators.
- **Cap.** At most `messages.max_page` events per page, keeping the newest of the
  window. Older ones of a very busy window are dropped (Consequences C1).
- **Users.** One query on `users` for the ids in `senderId` and `content.userId`,
  serialised with the same view as `GET /rooms/:id/members`. Deleted accounts come
  back with a `null` `displayName`.
- `lastSeq` semantics are kept: the events are read after it, bounded by it on the
  newest page, so the live catch-up (`seq > lastSeq`) stays idempotent.

Alternatives:

| Option | Why not |
|---|---|
| New `GET /rooms/:id/events` merged client-side | Two cursors and two paginations to reconcile, more client code, for the same data. |
| Live and `/sync` only | Lines missing on every open; unacceptable for the goal. |
| Window over the union of messages and events | Changes the meaning of `limit` and `hasMore` on a stable endpoint, and makes the page size depend on join noise. |

### D3. Names of users who are no longer members

Chosen: `users` embedded in the page (history) plus an accumulating directory in the
client (live). `useAuthors` keeps every user it has ever seen in a ref map fed by the
members list, and later by `users` of each page; a refetch of the members list never
removes an entry. A live `member_left` / `member_kicked` / `member_banned` targets someone
who was a member a moment ago, so the directory already holds them. Only a
join-then-leave inside one refetch window falls back to "Unknown user".

Rejected: a lookup-by-id endpoint (new API surface), and embedding `author` in stream
frames (changes the realtime payloads for every client).

### D4. Timeline model and grouping

`Timeline` gains `events: TimelineEvent[]` (ascending, unique by `seq`, same shape as
`SystemEvent`). `mergeFirstPage` and `prependOlder` fill it and dedupe by `seq`;
`applyRoomEvent` appends the six types (still behind the `seq > lastSeq` guard). The ban
`reason` is dropped there too, in case a stream frame carries it.

A new pure module `lib/timeline-items.ts` merges messages and events by `seq` into
display items and groups them, so the components stay dumb:

- item kinds: `message`, `system` (a single event) and `system-group`;
- a group is consecutive events of the **same type**, with no message between and,
  for the moderation types, the **same actor** (`senderId`);
- an event whose subject or actor is the reader is never grouped (D5);
- hidden messages (`hiddenAt`) do not split a group (they are not rendered);
- a group of size 1 is a plain `system` item.

`message-list.tsx` renders `TimelineItem[]` instead of `TimelineMessage[]`; the scroll
anchors keep using the first and last `seq` of the items. `SystemEventLine` and
`SystemEventGroup` are new components, muted, without actions.

### D5. Wording and i18n

Keys under `chat.system.*` in `common.json` (French and English), one per case, with
i18next plurals for groups:

| Event | Others | Reader is the subject |
|---|---|---|
| `member_joined` | `{{name}} joined the room` | `You joined the room` |
| `member_left` | `{{name}} left the room` | `You left the room` |
| `member_kicked` | `{{name}} was removed by {{actor}}` | `You were removed by {{actor}}` |
| `member_banned` | `{{name}} was banned by {{actor}}` | `You were banned by {{actor}}` |
| `member_unbanned` | `{{name}} was unbanned by {{actor}}` | `You were unbanned by {{actor}}` |
| `role_changed` | `{{name}} is now {{role}} (by {{actor}})` | `You are now {{role}} (by {{actor}})` |

Roles reuse the existing `rooms.*.role.*` labels (the `role` block at
`common.json:411`). Groups: `{{names}} and {{count}} others joined the room` (same for
left). Moderation groups (same actor) list up to three names then "and N others". When the
reader is the actor, the actor reads "you". The reader id comes from `useMe()`.
Author names go through `useAuthors` (D3) with the existing "Deleted account" and
"Unknown user" labels.

### D6. Unread and read state

System lines carry no unread weight. The unseen store reacts to `message_created` only
(F6) and `web-client-read-state` derives counters from messages and the receipt marker;
this feature changes neither. The overview keeps its dependency on read-state, now only to
state that contract.

## 3. Changes per workspace

### `docs/`

- [`messages-and-interactions.md`](../../../docs/protocol/messages-and-interactions.md),
  `GET /rooms/:id/messages`: the two new fields, the event window rule, the ban reason
  stripping, the cap, and a note that `senderId` is the actor.
- [`docs/protocol/CHANGELOG.md`](../../../docs/protocol/CHANGELOG.md): `Added` entry.
- New page `docs/technical/web-client-timeline-system-events.md` (context, alternatives
  above, consequences), linked from `docs/technical/README.md`.

### `apps/server` (`conversations` module)

- `messages.dto.ts` / `message.view.ts`: `SystemEventViewSchema`, `MessagePageSchema` gains
  `events` and `users`; the user view is shared with `listMembers`.
- `messages.service.ts` `listMessages`: after the messages query, compute `floor` and
  `ceiling`, read `RoomEvent` rows of the six types, strip the ban `reason`, cap, load users.
- `bun run openapi:emit` to regenerate `apps/server/openapi.json` (checked by `openapi:check`).
- Tests: e2e in `conversations-messages.e2e-spec.ts` (events on newest page; window on
  an older page; no overlap or gap across pages; `hasMore: false` reaches `seq 0`;
  ban `reason` absent; cap; `users` includes a user who left; a private room still needs
  `room.read`).

### `packages/sdk`

- `types/events.ts`: typed `MemberJoinedEvent`, `MemberLeftEvent`, `MemberKickedEvent`,
  `MemberBannedEvent`, `MemberUnbannedEvent`, `RoleChangedEvent` and remove them from
  `OtherRoomEventType`; export a `SystemEvent` union.
- `types/wire.ts` / `schemas.ts`: regenerated `MessagesPage` (with `events`, `users`);
  `resources/messages.ts` needs no signature change.
- Tests: `events.test.ts`, `schemas.test.ts` (`MessagesPageSchema` with the new fields),
  `messages.test.ts`.
- Changeset (`bunx changeset`, minor for `@ekozhq/sdk`).

### `apps/client-web`

- `features/chat/lib/timeline.ts`: `TimelineEvent`, `events` in `Timeline`, the three
  functions above, plus a `default`-branch case for the six types.
- `features/chat/lib/timeline-items.ts` (new, pure) and `timeline-items.test.ts`.
- `features/chat/hooks/use-authors.ts`: accumulating directory, `users` from pages.
- `features/chat/components/message-list.tsx`, new `system-event-line.tsx`,
  `system-event-group.tsx`.
- `shared/i18n/locales/{en,fr}/common.json`: `chat.system.*`.
- Tests: `timeline.test.ts`, `timeline-items.test.ts` (grouping rules: same type, message
  break, other type break, same-actor for moderation, reader never grouped, hidden message
  does not split), `use-authors` (departed user kept), `room-chat.test.tsx` (lines render
  from a page and from a live event, "You" wording).

## 4. Consequences

- **C1.** A window holding more events than `messages.max_page` (a mass join between two
  messages) loses its oldest events; the older ones are not reachable later.
- **C2.** A brand-new room starts with "creator joined the room" (`member_joined` follows
  `room_created`). Accepted.
- **C3.** The kicked or banned reader gets no live line (F8); it appears in history only
  while they can still read the room.
- **C4.** `GET /rooms/:id/messages` grows by one query on `room_event` and one on users per
  page; both hit `(roomId, seq)` and the primary key.
- **C5.** Non-breaking for existing clients: added fields only. The protocol changelog
  entry is `Added`.

## Découpage en tâches d'implémentation

1. [#186](https://github.com/marmotz/ekoz/issues/186): server and protocol, membership events and users in the history page.
2. [#187](https://github.com/marmotz/ekoz/issues/187): SDK, typed membership events and page fields (depends on #186).
3. [#188](https://github.com/marmotz/ekoz/issues/188): web client, timeline events model, grouping and author directory (depends on #187).
4. [#189](https://github.com/marmotz/ekoz/issues/189): web client, system event lines and groups, i18n, docs page (depends on #188).
