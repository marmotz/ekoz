# server — identity: session management endpoints

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#14](https://github.com/ekoz-chat/server/issues/14)

Reference: [../features/identity-and-profiles/technical.md §11](../features/identity-and-profiles/technical.md#11-login-and-sessions).

## To do

1. `GET /sessions` — list the caller's sessions, flag the current one.
2. `PATCH /sessions/:id` `{ deviceName }`.
3. `DELETE /sessions/:id` — revoke one (adds `sid` to the denylist).
4. `DELETE /sessions?all=true` — revoke all but current (or all).
5. `deviceName` derivation from the User-Agent when not provided at login.

## Dependencies

- [13-identity-auth-tokens-and-guards](13-identity-auth-tokens-and-guards.md)
