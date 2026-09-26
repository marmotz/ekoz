# Presence and typing

Design of the presence and typing slice across `apps/server`, `packages/sdk` and
`apps/client-web`. The wire contract is in the
[presence and typing protocol](../protocol/presence-and-typing.md); the transport
in [real-time transport](realtime-transport.md).

## Context

The first increment pushed a presence frame on every heartbeat to the peers of
the peers of the caller (a routing mistake), kept one record per user (two tabs
overwrote each other), emitted nothing when a status lapsed, wrote nothing when
the stream opened, and subscribed to typing per explicit membership at connect
time. The client had no way to send heartbeats or to show any of it.

## Server

### Per-recipient delivery

`EphemeralBroadcaster` notifies a **recipient**: `notifyPresence(userId, ...)` and
`notifyTyping(userId, ...)`. A connection listens on exactly two channels, its own
user's, and is released on close. Who receives a signal is decided when it is
emitted:

- presence goes to `PresenceService.visiblePeersOf(userId)`, the users who share a
  membership with the emitter;
- typing goes to the room's effective members (`EffectiveMembersQuery`, shared with
  the feed fan-out and the mention resolution), except the sender.

Alternative rejected: subscribing at connect time to the peers and rooms known
then. It missed inherited members and needed a reconnect after any membership
change.

### Per-client aggregation

`PresenceStore` keeps `Map<userId, Map<clientId, { lastBeat, idle }>>`, plus the
cached manual away preference and the last status pushed to peers. The status is
derived from all instances (see the protocol page for the rule). A heartbeat
without a `clientId` uses one default instance, so existing callers keep working.

### Emission on change, and the sweep

`PresenceService.publish(userId)` recomputes the status and notifies the visible
peers only when it differs from the last one pushed. Heartbeats, manual away
changes and the sweep call it. `PresenceSweepService` runs every 5 s
(`setInterval` with `unref`, stopped on shutdown, like the feed pruning): it
publishes every tracked user, then prunes instances older than
`presence.offline_after` and users left with nothing whose last status was
`offline`. It reads the windows from the configuration on each run, so a hot
reload applies without rescheduling.

Alternative rejected: one timer per user at the next threshold. It has to be
rescheduled on every beat and on every change of a window; the sweep costs one pass
over the live users and its 5 s of latency is negligible against windows counted in
minutes.

### Snapshot on connect

After subscribing, the events controller writes one `presence` frame per visible
peer that is not `offline`. Subscribing first means a change between the two steps
is not lost.

### Manual away

`PresencePreference` (`user_id`, `manual_away`) is the only persisted piece, without
a foreign key to `User` (the same rule as `Membership`). The store loads it on the
user's first heartbeat and `PUT /presence/preference` updates it and publishes. It
is cached in process, like the rest of the store, which is a single-instance
choice.

### Heartbeat response versus a discovery document

`POST /presence/heartbeat` returns `heartbeatInterval` and `typingTtl` (seconds)
instead of publishing them in the discovery document. Both are hot-reloadable
runtime settings, and the response is read on every beat, so a change reaches
clients within one interval without another request. It also carries `manualAway`,
which is how another device learns of a change without a dedicated frame.

## SDK

`client.presence` exposes `heartbeat`, `setManualAway`, `typing` and a `reporter`,
the heartbeat loop of one client instance:

- a random `clientId` per reporter, never persisted, so each tab is an instance;
- `start()` beats at once, then every `heartbeatInterval` of the last response
  (45 s before the first one, the server default); a failed beat is retried at the
  next tick;
- `setIdle(idle)` beats at once when the value changes, and restarts the schedule;
- `notifyTyping(roomId)` sends at most one signal per room every `typingTtl / 2`,
  and swallows failures: it is a fire-and-forget hint;
- `state` and `on('change')` expose the last status and manual away flag;
- the reporter stops on `session:invalid`, like the stream;
- `signOff()` stops the loop after one last idle heartbeat, so a user who signs out
  voluntarily appears away at once (the instance then expires like any other)
  instead of lingering online until the away window lapses. It must run while the
  session is still valid, so the client calls it before `auth.logout()`.

The SDK owns the scheduling so that every client gets the same behaviour; what
counts as idle is a decision of the client.

## Web client

`RealtimeConnection` runs the presence and typing stores and the activity tracker
next to the stream, and tears them down with it.

### Activity thresholds

`startPresenceActivity` marks the user idle when the tab has been hidden for 60 s,
or when a visible tab has had no `pointerdown`, `keydown` or `wheel` for 5 min. Any
input, or the tab becoming visible, makes the user active again at once. The
constants are `HIDDEN_IDLE_MS` and `VISIBLE_IDLE_MS` in
`shared/realtime/presence-activity.ts`.

### Stores

Both are module-level stores read with `useSyncExternalStore`, in the pattern of
the active-room record:

- the presence store holds a status per user from `presence` frames, and is
  cleared when the stream starts reconnecting, since the snapshot of the next
  connection refills it (an unknown user is `offline`);
- the typing store holds the users typing per room, each removed at the end of the
  frame's `ttl`, when that user posts a message in the room, or on reconnect.

The server never sends a user their own presence, so the own avatar reads
`reporter.state` instead (`useUserPresence` picks the right source).

### Surfaces

`UserAvatar` takes an optional `presence` and draws a dot with an accessible label.
It is shown on message authors who are members, the members panel, the profile card
and the own avatar in the user menu; `PresenceDot` draws the same dot without an
avatar, for a direct conversation in the rooms tree and in the room header. The typing line sits between the message list
and the composer with a fixed height, and the rooms tree shows animated dots on a
room where someone types unless it is the open one.

The user menu accepts entries that render themselves, next to link entries, which
is how the "Appear away" toggle is added without the `auth` feature knowing about
presence.

## Consequences

- Presence costs one query of the visible peers per status change, not per beat.
- The store is per process: a multi-instance deployment needs a shared store.
- A direct conversation shows the presence of its partner in the rooms tree and in the room header. The partner is read from the room members (one request per room, shared with the other features), so it costs a members request for each `dm` in the tree. A group conversation shows none.
