# @ekoz/sdk

JavaScript/TypeScript SDK for the Ekoz protocol. It encapsulates all network access to
an Ekoz server so that no client ever has to call `fetch` directly.

> **Status:** early development. Distributed via `bun link` / `npm link` from a
> neighbouring checkout only; not published to npm yet (see the
> [SDK packaging and protocol-version policy](../../docs/technical/sdk-packaging-and-protocol-policy.md)).

## Install (local development)

```bash
bun install
bun run build
bun link
```

Then, from a consumer checkout:

```bash
bun link @ekoz/sdk
```

## Quick start

```ts
import { createClient } from '@ekoz/sdk';

const client = createClient({ server: 'ekoz.example.com' });

const { session } = await client.auth.login({ identifier: 'alice/ekoz.example.com', password });
const me = await client.me.get();

client.on('session:invalid', ({ reason }) => {
  // reason: 'refresh_reuse' | 'refresh_failed' | 'logout' | 'account_suspended'
  redirectToLogin();
});
```

`createClient` receives a **server domain**, never a REST URL: it resolves
`GET /.well-known/ekoz` once and refuses to operate if the server does not
advertise a protocol major this SDK build supports. For local development
without a resolvable domain, pass `resolveApiUrl` instead:

```ts
const client = createClient({ resolveApiUrl: () => 'http://localhost:3000' });
```

## Resources

Every call goes through one namespaced client instance — no free functions, no
per-resource constructors:

| Namespace                 | Covers                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `client.setup`             | Setup-state probe, first-owner setup (`state`, `createOwner`)    |
| `client.auth`              | Policy, register, login, logout, email verification, password reset |
| `client.me`                | Own profile, avatar, email, password, username (state, cancel), account deletion |
| `client.users`             | Public profile lookup by identifier, user summaries by id, avatar blob |
| `client.sessions`          | List / rename / revoke the caller's own sessions                 |
| `client.invitations`       | Owner-only registration invitations                              |
| `client.admin`             | Owner-only user (list/get/create/lifecycle/password-reset), owner and username-request administration |
| `client.rooms`             | The caller's tree (`list`), detail, preview, children, own permissions, create space / channel, join / leave, join requests (request, list, approve, reject), members page |
| `client.conversations`     | The caller's direct and group conversations (`list`), create a one-to-one (`createDm`) or a group (`createGroup`), rename, add / remove members, grant / revoke admin, search contacts |
| `client.roomInvitations`   | The caller's pending room invitations (`listMine`, `accept`, `decline`) |
| `client.directory`         | Public room directory, search and paging (`list`)                |
| `client.messages`          | Room messages (`policy`, `list` with `before` / `after` / `around`, `get`, `send`, `edit`, `delete`, `pin`, `unpin`, `pins`, `react`, `unreact`), with mention targets and reactions |
| `client.mentions`          | The caller's mentions: `list` ("My mentions") and per-room `unread` counters |
| `client.groups`            | Room groups: `list`, `get`, `create`, `rename`, `remove`, `addMember`, `removeMember` |
| `client.receipts`          | Read markers: `set` (monotonic) and `list` for a room            |
| `client.presence`          | Heartbeat, manual away (`setManualAway`), typing signal, and `reporter`: the heartbeat loop with idle state and throttled typing, `signOff()` before a sign-out |
| `client.sync`              | Per-room catch-up (`get`), events typed as `RoomEvent`           |
| `client.stream`            | Account SSE stream (`connect` / `disconnect` / `status` / `on`) with fresh-ticket reconnection |
| `client.discovery`         | The resolved discovery document (`get` / `refresh`)              |
| `client.session`           | Local session state (`getState`, `resume`, `clear`)              |

## Realtime stream

`client.stream` wraps `GET /events`. The stream ticket is single use, so the SDK
closes the `EventSource` on every error and mints a fresh ticket before
reconnecting (jittered backoff, 1 s doubling to 30 s), resuming from the last
`feedSeq` it saw. The runtime needs a global `EventSource` (browsers), or pass
one with `createClient({ eventSource })`.

```ts
client.stream.on('room_event', ({ roomId, feedSeq, event }) => {
  if (event.type === 'message_created') console.log(event.content.body);
});
client.stream.on('reconnected', () => {/* catch up with client.sync.get(...) */});
client.stream.connect();
```

Note: the generated `Message` / `Member` types declare timestamps as `Date`, but
the wire carries ISO strings and the SDK does not parse responses; treat them as
strings.

## Errors

Every failed call rejects with a typed `EkozError` subclass, keyed off the
server's stable `problem+json` `code` (e.g. `InvalidCredentialsError`,
`ValidationError`, `NotFoundError`). An unrecognised `code` degrades to the
base `EkozError` — new server error codes never throw a `TypeError` in a
consumer's `catch` block.

## Registration flow

`auth.register` returns the created `AccountView` only — **no tokens**. The
consumer follows up with `auth.login`, with an email-verification step in
between when the server's `registration.mode` requires it:

```ts
await client.auth.register({ name, email, password, displayName });
// registration.mode === 'open': the consumer can log in immediately
// email verification required: wait for the consumer to click the emailed link,
// or poll, before calling login
await client.auth.login({ identifier, password });
```

`registration.mode === 'invite'` additionally requires `invitationToken`;
`registration.mode === 'admin'` closes this endpoint (`403
identity.registration_closed`) — accounts are created via `client.admin.users.create`.

## Session persistence

The SDK never touches `localStorage` or any other storage API directly —
persistence is delegated to a `SessionStore` you provide via
`createClient({ store })`. The access token itself is never persisted (it is
short-lived and re-minted from the refresh token); only `{ refreshToken,
sessionId, identifier }` is.

Default when `store` is omitted: an in-memory store (`memoryStore()`), lost on
process restart — fine for a short-lived server process or for tests.

Browser example, backed by `localStorage`:

```ts
import type { SessionState, SessionStore } from '@ekoz/sdk';

function localStorageSessionStore(key = 'ekoz.session'): SessionStore {
  return {
    load: () => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as SessionState) : null;
    },
    save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    clear: () => localStorage.removeItem(key),
  };
}

const client = createClient({ server: 'ekoz.example.com', store: localStorageSessionStore() });
```

Node / Bun example — the same `memoryStore()` the SDK uses by default:

```ts
import { memoryStore } from '@ekoz/sdk';

const client = createClient({ server: 'ekoz.example.com', store: memoryStore() });
```

On restart, call `client.session.resume()` to mount a persisted refresh token
and force a fresh access token before the first request; a stale/reused
refresh token surfaces as `session:invalid` and leaves the client
unauthenticated rather than throwing.

## Session lifecycle events

```ts
client.on('session:authenticated', ({ identifier, sessionId }) => {});
client.on('session:refreshed', ({ sessionId }) => {});
client.on('session:invalid', ({ reason }) => {});
client.on('session:cleared', () => {});
```

## Protocol version

Every request carries `X-Ekoz-Protocol: <major>`. `createClient` resolves the
server's discovery document once and throws `ProtocolMismatchError` up front
if none of `protocol_versions` matches a major this SDK build supports — no
resource call is attempted against an incompatible server.

## Scripts

| Script              | Purpose                                    |
|---------------------|--------------------------------------------|
| `bun run build`     | Dual ESM + CJS + `.d.ts` bundle via tsdown |
| `bun run test`      | Unit tests (Vitest)                        |
| `bun run typecheck` | `tsc --noEmit`                             |
| `bun run lint`      | Biome                                       |

Integration tests against a running reference server are opt-in — see
[`test/integration/README.md`](test/integration/README.md).

## Consumers

[`apps/client-web`](../../apps/client-web) (`auth` / `profile` features) and the
[admin console](../../backlog/features/admin-console/overview.md) consume this SDK
via `bun link`.

## Contributing

Every visible change needs a changeset (`bunx changeset`). Design decisions are
written up under [`docs/technical/`](../../docs/technical/); see
[CONTRIBUTING.md](../../CONTRIBUTING.md).
