---
sidebar_position: 3
---

# Realtime

Three parts work together: the **event stream** pushes what happens, **sync** catches
up on what was missed, and **presence** reports that this client is alive.

## Event stream

`client.stream` wraps the account event stream (`GET /events`). The stream ticket is
single use, so the SDK closes the underlying `EventSource` on every error and mints a
fresh ticket before reconnecting, with a jittered backoff from 1 s doubling up to 30 s.

```ts
client.stream.on('room_event', ({ roomId, feedSeq, event }) => {
  if (event.type === 'message_created') console.log(roomId, event.content.body);
});
client.stream.on('status', (status) => console.log(status));
client.stream.connect();
```

Available events:

| Event | Payload |
| ----- | ------- |
| `room_event` | `{ roomId, feedSeq, event }`, `event` is a `RoomEvent` |
| `account` | Account-scoped notification (invitation, join-request outcome, ...) |
| `presence` | `{ userId, status }` |
| `typing` | `{ roomId, userId, ttl }` |
| `status` | `'idle' \| 'connecting' \| 'open' \| 'reconnecting'` |
| `reconnected` | No payload, emitted after a reconnection |

`on` returns an unsubscribe function. `connect()` does nothing when the stream is
already running, `disconnect()` stops it, and `client.stream.status` is the current
state.

The runtime needs a global `EventSource`, which browsers provide. Elsewhere, pass an
implementation to `createClient({ eventSource })`; without any, `connect()` throws a
`TypeError`.

## Catch up after a gap

Events can be missed while the stream was down. On `reconnected`, fetch what happened
in each room you display, from the last sequence number you processed:

```ts
client.stream.on('reconnected', async () => {
  const { events, lastSeq } = await client.sync.get({ room: roomId, since: lastSeenSeq });
  events.forEach(applyEvent);
  lastSeenSeq = lastSeq;
});
```

Sequence numbers (`seq`, `lastSeq`, `feedSeq`) are decimal strings because they can
exceed `Number.MAX_SAFE_INTEGER`: compare them as such, never with `Number`.

## Presence and typing

`client.presence.reporter` runs the heartbeat loop of this client instance:

```ts
client.presence.reporter.start();

// user went idle / came back
client.presence.reporter.setIdle(true);

// while the user types in a room (throttled by the SDK)
client.presence.reporter.notifyTyping(roomId);

// before a voluntary sign-out, while the session is still valid
await client.presence.reporter.signOff();
await client.auth.logout();
```

`start()` beats immediately and then at the interval the server advertises.
`setManualAway(true)` persists the "appear away" preference, and `reporter.state`
holds the last status the server reported. `reporter.on('change', ...)` notifies when
it changes.

## Timestamps

The generated `Message` and `Member` types declare timestamps as `Date`, but the wire
carries ISO strings and the SDK does not parse responses: treat them as strings.
