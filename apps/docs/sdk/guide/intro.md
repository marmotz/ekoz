---
slug: /intro
sidebar_position: 1
---

# SDK

`@ekozhq/sdk` is the JavaScript / TypeScript SDK for the Ekoz protocol. It is the
only integration surface for an Ekoz client: every network access goes through it,
so a client never calls `fetch` directly. It has a single runtime dependency (`zod`)
and ships ESM and CJS builds with type declarations.

## What it does for you

- **Discovery**: `createClient` resolves `GET /.well-known/ekoz` once and refuses to
  operate against a server that advertises no protocol major the SDK supports
  (`ProtocolMismatchError`).
- **Sessions**: it stores the refresh token in a store you provide, mints access tokens
  on demand and reports session changes through events.
- **Typed resources**: one namespaced client (`client.rooms`, `client.messages`,
  `client.files`, ...) with typed requests and responses.
- **Typed errors**: every failure rejects with an `EkozError` subclass keyed off the
  server's stable error code.
- **Realtime**: `client.stream` wraps the account event stream with fresh-ticket
  reconnection, and `client.sync` catches up on missed events.

## Where to go next

| Page | Content |
| ---- | ------- |
| [Quickstart](quickstart.md) | Install, create a client, sign in, send a message |
| [Authentication and sessions](auth.md) | Registration, login, session persistence, lifecycle events, errors |
| [Realtime](realtime.md) | Event stream, catch-up, presence and typing |
| [API reference](../api/index.md) | Every exported function, type and class, generated from the sources |

The wire format behind every call is described in the [Protocol](/protocol/)
documentation.
