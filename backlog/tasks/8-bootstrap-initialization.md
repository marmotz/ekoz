# server — bootstrap and setup state machine

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#8](https://github.com/ekoz-chat/server/issues/8)

Reference: [../features/server-core/technical.md §5](../features/server-core/technical.md#5-bootstrap--initialization)
and [ADR 0010](../../docs/technical/adr/0010-server-initialization.md).

## To do

1. `BootstrapService` run on start: validate infra config, verify schema is
   current, ensure a signing key exists (generate otherwise).
2. Setup state resolution: `closed` if an owner user exists; else `email-pinned`
   if `EKOZ_INITIAL_OWNER_EMAIL` is set; else `token-pinned`.
3. `token-pinned`: generate a single-use token, print its value to stdout once
   (`warn`), store its hash in the `SetupToken` model (`tokenHash`, `createdAt`,
   `consumedAt`).
4. `SetupGuard` + `SetupService`: expose setup only while open; all `/setup/*`
   routes return `410 Gone` once an owner exists (and forever after).
5. Emit `server.initialized` to the audit log on successful setup.
6. The `POST /setup/owner` endpoint that actually creates the first `User`
   (`isOwner = true`, email verified, initial session) lives in
   [identity-and-profiles](../features/identity-and-profiles/technical.md#5-bootstrap--initialization) —
   this task provides the guard, state and token; wire them together there.

## Dependencies

- [4-config-system](4-config-system.md)
- [5-crypto-and-signing-keys](5-crypto-and-signing-keys.md)
- [7-audit-log](7-audit-log.md)
