# spec — protocol "Identity and profiles" section

**Status**: todo
**Type**: docs
**Issue**: [#39](https://github.com/marmotz/ekoz/issues/39)

Reference: [sdk-js SDK foundations technical design §11](../features/sdk-foundations/technical.md#11-typage-bout-en-bout),
[§15](../features/sdk-foundations/technical.md#15-conséquences-vérifiées).

## Verified findings

- [docs/protocol/README.md](../../docs/protocol/README.md)
  lists "Authentication and sessions" and "Identity and profiles" as sections
  still to write; only `discovery.md` exists under `docs/protocol/`.
- Repo `AGENTS.md` / [HTTP API conventions](../../docs/technical/api-conventions.md):
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
   [server identity.errors.ts](../../apps/server/src/modules/identity/identity.errors.ts)).
3. Document the `X-Ekoz-Protocol` request header and the `code` namespace
   (`auth.*` / `identity.*`).
4. Update `docs/protocol/README.md` and `docs/protocol/CHANGELOG.md`.
5. Reconcile any mismatch found between this write-up and the SDK types /
   server code in this repo first.

## Dependencies

Depends on #22
Depends on #23
Depends on #24

The SDK resource tasks establish the exact contract to document:

- #27 — setup and auth resource bindings
- #27 — profile, account and sessions resource bindings
- #27 — invitations and admin resource bindings
