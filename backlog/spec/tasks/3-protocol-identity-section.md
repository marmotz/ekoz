# spec — protocol "Identity and profiles" section

**Status**: todo
**Type**: docs
**Repo**: ekoz-chat/spec
**Issue**: [#3](https://github.com/ekoz-chat/spec/issues/3)

Reference: [sdk-js SDK foundations technical design §11](https://github.com/ekoz-chat/sdk-js/blob/develop/backlog/features/sdk-foundations/technical.md#11-typage-bout-en-bout),
[§15](https://github.com/ekoz-chat/sdk-js/blob/develop/backlog/features/sdk-foundations/technical.md#15-conséquences-vérifiées).

## Verified findings

- [docs/protocol/README.md](https://github.com/ekoz-chat/spec/blob/main/docs/protocol/README.md)
  lists "Authentication and sessions" and "Identity and profiles" as sections
  still to write; only `discovery.md` exists under `docs/protocol/`.
- Repo `AGENTS.md` / [HTTP API conventions](../../../docs/technical/api-conventions.md):
  a discrepancy with the protocol is fixed here, not worked around in the SDK —
  so the wire contract the SDK binds must be written down in this repo.

## To do

1. Write `docs/protocol/identity.md` (or the section layout the maintainers
   prefer) covering the endpoints the SDK binds in the first increment: setup
   owner, registration (3 modes), login / refresh / logout, email verification,
   password reset, `me` profile / avatar / email / username, sessions,
   invitations, and the `admin/*` owner operations.
2. For each: method, path, request body, success shape, and the `problem+json`
   `code` values it can return (from
   [server identity.errors.ts](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/identity.errors.ts)).
3. Document the `X-Ekoz-Protocol` request header and the `code` namespace
   (`auth.*` / `identity.*`).
4. Update `docs/protocol/README.md` and `docs/protocol/CHANGELOG.md`.
5. Reconcile any mismatch found between this write-up and the SDK types /
   server code in this repo first.

## Dependencies

Depends on ekoz-chat/sdk-js#6
Depends on ekoz-chat/sdk-js#7
Depends on ekoz-chat/sdk-js#8

The SDK resource tasks establish the exact contract to document:

- [ekoz-chat/sdk-js#6](https://github.com/ekoz-chat/sdk-js/issues/6) — setup and auth resource bindings
- [ekoz-chat/sdk-js#7](https://github.com/ekoz-chat/sdk-js/issues/7) — profile, account and sessions resource bindings
- [ekoz-chat/sdk-js#8](https://github.com/ekoz-chat/sdk-js/issues/8) — invitations and admin resource bindings
