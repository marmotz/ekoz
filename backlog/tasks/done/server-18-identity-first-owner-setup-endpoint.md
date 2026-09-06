# server — identity: first-owner setup endpoint

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/identity-and-profiles/technical.md §1](../../features/identity-and-profiles/technical.md),
[server-core §5](../../features/server-core/technical.md#5-bootstrap--initialization),
[server initialization](../../../docs/technical/server-initialization.md).

## To do

1. `POST /setup/owner` `{ email, password, name, displayName, token? }`, guarded
   by server-core's `SetupGuard`:
   - email-pinned: `email` must equal `EKOZ_INITIAL_OWNER_EMAIL`;
   - token-pinned: `token` must match the stored `SetupToken` hash.
2. Create the first `User` (`isOwner = true`, `emailVerifiedAt = now()`) +
   `UserProfile` + an initial `Session`; consume the setup token.
3. Emit `server.initialized` to the audit log; from then on `/setup/*` → `410`.

## Dependencies

- [12-identity-user-model-and-identifier](server-12-identity-user-model-and-identifier.md)
- [13-identity-auth-tokens-and-guards](server-13-identity-auth-tokens-and-guards.md)
- server-core [#8 bootstrap and setup state machine](server-8-bootstrap-initialization.md)
