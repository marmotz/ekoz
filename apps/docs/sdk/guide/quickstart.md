---
sidebar_position: 1
---

# Quickstart

This page takes a fresh project to a signed-in client that sends a message.

## Install

`@ekozhq/sdk` is not published to npm yet. Build it from a checkout of the repository
and link it into your project:

```bash
# in the Ekoz checkout
bun install
bun run build
cd packages/sdk && bun link

# in your project
bun link @ekozhq/sdk
```

## Create a client

`createClient` takes a **server domain**, never a REST URL. It resolves the discovery
document at `/.well-known/ekoz` before the first request.

```ts
import { createClient } from '@ekozhq/sdk';

const client = createClient({ server: 'ekoz.example.com' });
```

For local development without a resolvable domain, pass `resolveApiUrl` instead. It
skips discovery and gives the REST base URL directly:

```ts
const client = createClient({ resolveApiUrl: () => 'http://localhost:3010' });
```

| Option | Purpose |
| ------ | ------- |
| `server` | Server domain, scheme optional. Required unless `resolveApiUrl` is set |
| `resolveApiUrl` | Returns the REST base URL directly, skipping discovery |
| `store` | Session persistence, see [Authentication](auth.md#persist-the-session). Defaults to memory |
| `fetch` | `fetch` implementation, defaults to the global one |
| `eventSource` | `EventSource` implementation for `client.stream`, defaults to the global one |

## Sign in

```ts
await client.auth.login({
  identifier: 'alice/ekoz.example.com',
  password: '...',
});

const me = await client.me.get();
```

The identifier is `username/server-domain`. After `login`, the client holds the
session: later calls are authenticated and the access token is refreshed for you.

## Read and write

```ts
const tree = await client.rooms.list();
const roomId = tree.items[0]?.id; // pick any room you are a member of

const page = await client.messages.list(roomId, { limit: 20 });

await client.messages.send(roomId, { body: 'Hello from the SDK' });
```

Every resource is a property of the client: `client.rooms`, `client.conversations`,
`client.messages`, `client.files`, `client.uploads`, `client.mentions`, and so on. The
[API reference](../api/index.md) lists all of them under the `EkozClient` interface.

## Handle errors

Failed calls reject with a subclass of `EkozError`:

```ts
import { InvalidCredentialsError, RateLimitError } from '@ekozhq/sdk';

try {
  await client.auth.login({ identifier, password });
} catch (error) {
  if (error instanceof InvalidCredentialsError) showWrongPassword();
  else if (error instanceof RateLimitError) showTryLater();
  else throw error;
}
```

## Next

- [Authentication and sessions](auth.md)
- [Realtime](realtime.md)
