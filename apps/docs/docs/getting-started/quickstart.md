---
sidebar_position: 1
---

# Quickstart

Connect a minimal client to a local Ekoz server. It assumes the server is running
as described in [installation](installation.md) and that you created the first owner
account (see [First owner](installation.md#first-owner)).

## 1. Get the SDK

`@ekozhq/sdk` is not published to npm yet. Build it from a checkout of the
repository and link it from your project:

```bash
# in the Ekoz checkout
bun install
bun run build
cd packages/sdk && bun link

# in your project
bun link @ekozhq/sdk
```

## 2. Create a client and sign in

`createClient` takes a server domain and resolves the discovery document at
`/.well-known/ekoz`. A local server has no resolvable public domain, so pass
`resolveApiUrl` instead:

```ts
import { createClient } from '@ekozhq/sdk';

const client = createClient({ resolveApiUrl: () => 'http://localhost:3010' });

await client.auth.login({ identifier: 'alice/ekoz.example.com', password: '...' });

const me = await client.me.get();
console.log(me);
```

The identifier has the form `username/server-domain`, where the domain is the
`server.domain` value of the server configuration.

## 3. Listen to events

```ts
client.stream.on('room_event', ({ roomId, event }) => console.log(roomId, event));
client.stream.connect();
```

Clients never call `fetch` directly: every network access goes through the SDK.

## Next steps

- The [SDK guide](/sdk/intro) covers every resource of the client.
- The [Protocol](/protocol/) documentation describes the wire format.
