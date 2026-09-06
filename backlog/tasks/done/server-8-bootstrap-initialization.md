# server — bootstrap and setup state machine

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §5](../../features/server-core/technical.md#5-bootstrap--initialization)
and [server initialization](../../../docs/technical/server-initialization.md).

## To do

1. `BootstrapService` run on start: validate infra config, verify schema is
   current, ensure a signing key exists (generate otherwise).
2. Setup state resolution: `closed` if an owner user exists; else `email-pinned`
   if `EKOZ_INITIAL_OWNER_EMAIL` is set; else `token-pinned`.
3. `token-pinned`: rotate a single-use token on every boot while setup is open
   (drop the previous unconsumed row, generate a fresh token, print its value to
   stdout at `warn`), storing only its hash in the `SetupToken` model
   (`tokenHash`, `createdAt`, `consumedAt`). Only the hash is persisted, so a
   missed log line is recovered by restarting, not lost.
4. `SetupGuard` + `SetupService`: expose setup only while open; all `/setup/*`
   routes return `410 Gone` once an owner exists (and forever after).
5. Emit `server.initialized` to the audit log on successful setup.
6. The `POST /setup/owner` endpoint that actually creates the first `User`
   (`isOwner = true`, email verified, initial session) lives in
   [identity-and-profiles](../../features/identity-and-profiles/technical.md#5-bootstrap--initialization) —
   this task provides the guard, state and token; wire them together there.

## Dependencies

- [4-config-system](server-4-config-system.md)
- [5-crypto-and-signing-keys](server-5-crypto-and-signing-keys.md)
- [7-audit-log](server-7-audit-log.md)
