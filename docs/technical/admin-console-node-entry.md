# Admin console Node entry point

## Context

`apps/admin` targets a plain Node process in production (see
[web client stack](web-client-stack.md) and
`backlog/_archives/features/server-administration/technical.md` §4). At the installed
`@tanstack/react-start` version (1.168.x), `vite build` emits
`dist/server/server.js`, which exports a Web-standard `{ fetch(request) }`
handler — it does not start its own listener the way older Nitro-based Start
builds did.

## Decision

`apps/admin/server.entry.mjs` is a small hand-written adapter: a `node:http`
server that converts each incoming `IncomingMessage` into a `Request`, calls
the built handler's `fetch`, and streams the `Response` back. `bun run start`
runs this file instead of the build output directly.

## Consequences

- No extra framework dependency was added for this — the adapter is ~25 lines
  using only Node/Web-standard APIs (`node:http`, `Request`, `Response`,
  `ReadableStream`).
- If a future `@tanstack/react-start` upgrade reintroduces a built-in Node
  listener target, this file becomes redundant and `start` can point at the
  build output directly.
