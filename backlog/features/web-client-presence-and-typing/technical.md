# Web client presence and typing — technical design

Technical design for presence and typing across `apps/server` (fixes and protocol
additions in the `conversations` presence slice), `packages/sdk` (bindings plus
the heartbeat and typing schedulers) and `apps/client-web` (activity detection,
stores, indicators). Product decisions are in [overview.md](./overview.md); this
page grounds them in the code.

Related: [presence and typing protocol](../../../docs/protocol/presence-and-typing.md),
[synchronisation](../../../docs/protocol/synchronisation.md),
[real-time transport](../../../docs/technical/realtime-transport.md),
[conversations technical design §15](../../_archives/features/conversations/technical.md),
[web client chat](../../../docs/technical/web-client-chat.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | **Routing bug.** `heartbeat` emits on `presence:<recipientId>` for each peer, but `GET /events` subscribes to `presence:<peerId>` for each of the caller's peers. A connection therefore receives the heartbeats of its peers' peers (itself included, once per shared peer), never those of its own peers. | [presence.service.ts:26](../../../apps/server/src/modules/conversations/presence/presence.service.ts), [events.controller.ts:132](../../../apps/server/src/modules/conversations/streaming/events.controller.ts) | The connection must subscribe to its own channel `presence:<ownUserId>`, which is what `notifyPresence` already targets. |
| F2 | A frame is pushed on **every** heartbeat, not on a status change (the protocol page says "one per user whose derived status changed"). Nothing is pushed when a status lapses to `away` / `offline`: no heartbeat, no emission. | [presence.service.ts:22](../../../apps/server/src/modules/conversations/presence/presence.service.ts) | The server needs a last-emitted status per user and a periodic sweep. |
| F3 | Nothing is sent when the stream opens. | [events.controller.ts:129](../../../apps/server/src/modules/conversations/streaming/events.controller.ts) | A snapshot of visible peers is written right after subscribing. |
| F4 | The store keeps **one** record per user (`lastBeat`, `explicitAway`). Two tabs, one idle (`away: true`) and one active, overwrite each other on every beat. | [presence.store.ts:24](../../../apps/server/src/modules/conversations/presence/presence.store.ts) | Records keyed per client instance (`clientId`). |
| F5 | Typing is subscribed at connect time per **explicit** membership only. A space member reading a channel by inheritance never receives its typing frames, and a membership change needs a reconnect. The feed fan-out already resolves effective members. | [events.controller.ts:140](../../../apps/server/src/modules/conversations/streaming/events.controller.ts), [feed-fanout.service.ts:49](../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | Typing is fanned out per recipient at emission time, to effective members. |
| F6 | No endpoint exposes `presence.heartbeat_interval` or `typing.ttl` to clients. Both are hot-reloadable runtime keys. | [registry.ts:444](../../../apps/server/src/core/config/registry.ts) | Returned by the heartbeat response (decided). |
| F7 | `visiblePeersOf` reads `Membership` of the caller's rooms: co-members of a space cover the members of its channels by inheritance, `dm` / `group_dm` rows cover partners. | [presence.service.ts:42](../../../apps/server/src/modules/conversations/presence/presence.service.ts) | Kept as is, but evaluated at emission time (F1 fix) instead of at connect time. |
| F8 | The SDK already parses `presence` and `typing` frames and exposes them as `stream.on('presence' \| 'typing')`; there is no `presence` resource and no heartbeat binding. | [stream.ts:47](../../../packages/sdk/src/resources/stream.ts), [client.ts:104](../../../packages/sdk/src/client.ts) | New `client.presence` resource. |
| F9 | `shared/realtime` exposes generic hooks (`useRoomEvents`, `useReconnected`, ...) and module-level stores read with `useSyncExternalStore` (`unseen-rooms`). `RealtimeConnection` owns the stream lifetime. | [use-realtime.ts](../../../apps/client-web/src/shared/realtime/use-realtime.ts), [unseen-rooms.ts](../../../apps/client-web/src/shared/realtime/unseen-rooms.ts), [realtime-provider.tsx:13](../../../apps/client-web/src/shared/realtime/realtime-provider.tsx) | Presence and typing stores follow the same pattern. |
| F10 | `useRoomHasUnseen` is documented as read by the room tree but no component renders it; `RoomTreeItem` has no trailing indicator slot. | [room-tree.tsx:74](../../../apps/client-web/src/features/rooms/components/room-tree.tsx) | The typing indicator adds the trailing slot; wiring the unseen dot is left to [`web-client-read-state`](../web-client-read-state/overview.md). |
| F11 | `UserMenuItem` only supports links (`to`); the menu (owned by `auth`) renders them as `Link`. | [user-menu-items.ts:4](../../../apps/client-web/src/shared/layout/user-menu-items.ts), [user-menu.tsx](../../../apps/client-web/src/features/auth/components/user-menu.tsx) | The registry gains a component entry for the "appear away" toggle. |
| F12 | `UserAvatar` is a pure `shared/ui` component; message items get `authorId` through `resolveAuthor`. | [user-avatar.tsx](../../../apps/client-web/src/shared/ui/user-avatar.tsx), [message-item.tsx:48](../../../apps/client-web/src/features/chat/components/message-item.tsx) | A `presence` prop on the avatar; callers read the store. |

## 2. Server changes (`apps/server`, `conversations/presence` and `streaming`)

### S1. Per-recipient delivery (fixes F1, F5, F7)

- `EventsController` subscribes to exactly two channels for its own user:
  `presence:<userId>` and `typing:<userId>`. The connect-time peer and room
  lists disappear, and with them the "membership change needs a reconnect"
  limitation for presence and typing.
- `EphemeralBroadcaster`: `emitTyping(roomId, ...)` / `onTyping(roomId, ...)`
  become `notifyTyping(recipientUserId, signal)` / `onTyping(userId, ...)`,
  symmetrical with presence.
- `TypingService.broadcastTyping` resolves the room's effective members (same
  query as `FeedFanoutService.effectiveMemberIds`, extracted to a shared
  `EffectiveMembersService` in `conversations/membership` and reused by both)
  and notifies each one except the actor.
- `PresenceService` emits to `visiblePeersOf(userId)` resolved at emission time.

### S2. Store per client instance (F4)

`PresenceStore` records become `Map<userId, Map<clientId, { lastBeat, idle }>>`.
Heartbeat body: `{ away?: boolean, clientId?: string }` (`clientId` 1-64 chars,
absent = one shared default slot, so existing callers keep working). `away` keeps
its protocol meaning, renamed `idle` internally to separate it from manual away.

Derived status of a user, evaluated at `now`:

1. no fresh record (every `lastBeat` older than `presence.offline_after`) → `offline`;
2. `manualAway` (S4) → `away`;
3. any fresh record with `idle = false` and `lastBeat` within `presence.away_after` → `online`;
4. otherwise → `away`.

Records older than `offline_after` are dropped by the sweep (S3), so the map
stays bounded by live clients.

### S3. Emission on change and lapse sweep (F2)

The store keeps `lastEmitted: PresenceStatus` per user. `PresenceService.publish(userId)`
recomputes the status and, only when it differs from `lastEmitted`, stores it and
notifies visible peers. Called by: heartbeat, manual away change (S4), and a new
`PresenceSweepService` (`setInterval` every 5 s with `unref`, same lifecycle as
[`FeedPruningService`](../../../apps/server/src/modules/conversations/streaming/feed-pruning.service.ts))
that runs `publish` for every user in the store and removes users whose last
emitted status is `offline` with no record left.

Alternative rejected: one `setTimeout` per user at the next threshold. Needs
rescheduling on every beat and on hot reload of the windows; the sweep reads the
current config each run and costs one pass over live users.

Lapse latency is at most the sweep interval (5 s) past the window, acceptable
against minute-scale windows.

### S4. Manual away, persisted

New model in the conversations section of
[contract.prisma](../../../apps/server/src/core/prisma/contract.prisma), no FK to
`User` (same cross-feature rule as `Membership`):

```prisma
model PresencePreference {
  userId     String                     @id @map("user_id")
  manualAway Boolean                    @default(false) @map("manual_away")
  updatedAt  temporal.updatedAtString() @map("updated_at")

  @@map("presence_preference")
}
```

Migration `conv_presence_preference` under `prisma/migrations/app`. The store
caches `manualAway` per user, loaded on the user's first heartbeat and updated
by the endpoint below (single instance in this increment; a multi-instance store
would read it with the rest of the state).

`PUT /presence/preference`, authenticated, body `{ manualAway: boolean }`,
`200 { status, manualAway }`. Upserts the row, updates the cache, calls
`publish`. No row = `manualAway: false`.

### S5. Heartbeat response (F6)

`POST /presence/heartbeat` → `201 { status, manualAway, heartbeatInterval, typingTtl }`,
the two durations in seconds, read from config at each call (hot reload is
picked up on the next beat). This is how another device learns a manual away
change (decided: no dedicated frame).

### S6. Snapshot on connect (F3)

After subscribing (so no change is lost between the two steps), `EventsController`
writes one `presence` frame per visible peer whose status is not `offline`.
Clients treat an unknown user as `offline`. Same frame shape, no new event type.

### S7. Protocol and docs

- [presence-and-typing.md](../../../docs/protocol/presence-and-typing.md):
  `clientId`, aggregation rule, response fields, `PUT /presence/preference`,
  emission on change and on lapse, snapshot at connect, typing delivered to
  effective members and not echoed to the sender, and removal of the
  connect-time visibility limitation.
- [synchronisation.md](../../../docs/protocol/synchronisation.md): snapshot
  frames at stream open.
- Protocol `CHANGELOG.md` entry (additive: optional request field, new response
  fields, new endpoint).
- `openapi:emit`, then SDK type regeneration.

### S8. Server tests

- `presence.store.spec.ts`: aggregation across clientIds (idle + active = online,
  all idle = away, manual away wins, expiry), record pruning.
- `presence.service` unit: emits only on change, to visible peers.
- `presence-sweep` unit (fake timers): lapse to away then offline emits once each.
- `events.controller.spec.ts`: subscribes to own channels, writes the snapshot,
  unsubscribes on close.
- `conversations-presence-typing.e2e-spec.ts`: two users sharing a room receive
  each other's presence (regression for F1), a space member receives typing of a
  child channel (F5), the actor does not receive its own typing, preference
  round trip survives a second login, heartbeat returns the durations.

## 3. SDK (`packages/sdk`)

New `resources/presence.ts`, exposed as `client.presence`:

```ts
interface PresenceResource {
  heartbeat(body?: { away?: boolean; clientId?: string }): Promise<HeartbeatResponse>;
  setManualAway(manualAway: boolean): Promise<PresencePreferenceResponse>;
  typing(roomId: string): Promise<void>;
  /** Heartbeat loop for this client instance. */
  readonly reporter: PresenceReporter;
}

interface PresenceReporter {
  start(): void;            // immediate beat, then every heartbeatInterval
  stop(): void;
  setIdle(idle: boolean): void;   // beats immediately when the value changes
  setManualAway(away: boolean): Promise<void>;
  /** Throttled typing: at most one POST per room every typingTtl / 2. */
  notifyTyping(roomId: string): void;
  readonly state: { status: PresenceStatus; manualAway: boolean } | null;
  on(name: 'change', listener: () => void): () => void;
}
```

- `clientId`: random per reporter instance (one per tab), never persisted.
- Interval and TTL come from the last heartbeat response; before the first one,
  defaults matching the server defaults (45 s, 6 s).
- A failed beat retries at the next tick; `session:invalid` stops the reporter,
  as it disconnects the stream ([stream.ts:111](../../../packages/sdk/src/resources/stream.ts)).
- Typing failures are swallowed (fire-and-forget signal).
- Tests with fake timers: schedule, idle change triggers an immediate beat,
  interval follows the response, typing throttle per room, stop on
  `session:invalid`. Changeset (minor).

## 4. Web client (`apps/client-web`)

### C1. Own presence

`shared/realtime/presence-activity.ts`, started by `RealtimeConnection` with the
stream: `sdk.presence.reporter.start()` / `stop()` on unmount. Activity:

- hidden tab (`visibilitychange`) for more than 60 s → `setIdle(true)`;
- visible tab with no `pointerdown` / `keydown` / `wheel` for 5 min → `setIdle(true)`;
- any input or becoming visible → `setIdle(false)`.

Constants in the module, documented in the technical doc page.

### C2. Presence store

`shared/realtime/presence-store.ts`, same pattern as `unseen-rooms`:
`Map<userId, PresenceStatus>` written from `stream.on('presence')`, cleared on
`status: reconnecting` (the snapshot of the next connection refills it) and on
unmount. `usePresence(userId): PresenceStatus` returns `offline` for an unknown
user.

### C3. Presence indicator

`UserAvatar` gets an optional `presence?: PresenceStatus` prop rendering a dot
(green online, amber away, hollow grey offline) with an `aria-label` from
`presence.status.*`. Consumers:

- message author ([message-item.tsx](../../../apps/client-web/src/features/chat/components/message-item.tsx)): `usePresence(message.authorId)`;
- own avatar in the user menu, from `reporter.state`;
- members panel, member profile and direct conversations: they do not exist yet;
  their features ([`web-client-members`](../web-client-members/overview.md),
  [`web-client-direct-messages`](../web-client-direct-messages/overview.md)) are
  delivered first, and this feature adds `usePresence` to their avatars.

### C4. "Appear away" toggle

`UserMenuItem` becomes a union: the existing link entry, or
`{ id, order?, Component: ComponentType }` rendered as is inside the menu.
`shared/realtime` registers `PresenceMenuItem` ("Appear away" / "Appear online",
from `reporter.state.manualAway`) calling `reporter.setManualAway`.

### C5. Typing

- `shared/realtime/typing-store.ts`: `Map<roomId, Map<userId, expiresAt>>` fed
  by `stream.on('typing')` (own user ignored), an entry removed at `expiresAt`
  (`ttl` from the frame) or when a `message_created` from that user arrives in
  that room. Cleared on reconnect. Hooks: `useTypingUsers(roomId): string[]`,
  `useRoomHasTyping(roomId): boolean`.
- Composer: `onChange` with a non-empty value calls
  `sdk.presence.reporter.notifyTyping(roomId)` (new `onTyping` prop, wired in
  `RoomChat`).
- `TypingLine` between the message list and the composer in `RoomChat`: names
  resolved through the existing `useAuthors` resolver, formats "{a} is typing…",
  "{a} and {b} are typing…", "{a}, {b} and {c} are typing…", "Several people are
  typing…" beyond three. Fixed height to avoid layout jumps, `aria-live="polite"`.
- Sidebar: `RoomTreeItem` gains a trailing slot showing an animated dots icon
  when `useRoomHasTyping(room.id)` and the room is not the active one.

### C6. i18n and tests

Keys under `presence.*` and `chat.typing.*` in `en` and `fr` `common.json`.
Tests: stores (frames, expiry, reconnect reset, message clears typing),
activity (fake timers, visibility), `TypingLine` formats, avatar dot, menu
toggle, composer calls `notifyTyping`, room tree indicator.

## 5. Documentation

New [`docs/technical/presence-and-typing.md`](../../../docs/technical/) page
(context, per-client aggregation, sweep vs timers, heartbeat response vs discovery,
SDK-side scheduling, client activity thresholds), linked from
[realtime-transport.md](../../../docs/technical/realtime-transport.md), whose
"Typing: at most 1 POST every 3-5 s" line becomes "every `typingTtl / 2`".

## 6. Delivery order

Server S1-S7 first (it unblocks everything and fixes F1 alone), then the SDK,
then the client. The C3 surfaces for the members panel, profile and direct
conversations require [`web-client-members`](../web-client-members/overview.md)
and [`web-client-direct-messages`](../web-client-direct-messages/overview.md).

## Implementation tasks

1. [#129](https://github.com/marmotz/ekoz/issues/129) Server: per-recipient delivery of presence and typing (S1)
2. [#130](https://github.com/marmotz/ekoz/issues/130) Server: per-client state, emission on change, lapse sweep, connect snapshot (S2, S3, S6)
3. [#131](https://github.com/marmotz/ekoz/issues/131) Server: persisted manual away, heartbeat response settings (S4, S5)
4. [#132](https://github.com/marmotz/ekoz/issues/132) SDK: `client.presence`, heartbeat reporter, typing throttle (§3)
5. [#133](https://github.com/marmotz/ekoz/issues/133) Client: own presence, presence store, avatar dot, appear-away toggle (C1-C4)
6. [#134](https://github.com/marmotz/ekoz/issues/134) Client: typing store, typing line, sidebar indicator (C5)
7. [#135](https://github.com/marmotz/ekoz/issues/135) Client: presence on members panel, profile card, direct conversations (C3, §6)
