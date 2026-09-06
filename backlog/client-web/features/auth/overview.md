# Auth

**Status**: in discussion

## Context

Split out of [web-client-foundations](../web-client-foundations/overview.md),
which delivers only the client bootstrap. The reference server has shipped its
identity layer; this feature makes the authentication flows exercisable from the
demonstration UI.

## Goal

A visitor can register (in every server registration mode), verify their email
and request a new verification mail, sign in and out, and reset a forgotten
password, all against a running reference server.

## Decisions made

- Lives in `src/features/auth/{api,components,hooks,routes}`; all network access
  through [`sdk-js`](https://github.com/ekoz-chat/sdk-js).
- <fill in as decisions are made>

## Dependencies

- [web-client-foundations](../web-client-foundations/overview.md) — bootstrap,
  layout, routing, SDK session wiring.
- [SDK foundations](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/overview.md)
  — identity bindings must be exposed first.

## Feature order

After `web-client-foundations`, before [`profile`](../profile/overview.md).
