# Profile

**Status**: in discussion

## Context

Split out of [web-client-foundations](../web-client-foundations/overview.md).
Once a user can sign in ([`auth`](../auth/overview.md)), they need a UI to manage
their own account: profile, credentials and sessions.

## Goal

A signed-in user can read and update their profile (display name, avatar),
change their username and email, and list, rename and revoke their active
sessions, all against a running reference server.

## Decisions made

- Lives in `src/features/profile/{api,components,hooks,routes}`; all network
  access through [`sdk-js`](https://github.com/ekoz-chat/sdk-js).
- <fill in as decisions are made>

## Dependencies

- [`auth`](../auth/overview.md) — a signed-in session is required.
- [web-client-foundations](../web-client-foundations/overview.md) — bootstrap and
  layout.

## Feature order

Last of the identity triad: `web-client-foundations` -> `auth` -> `profile`.
