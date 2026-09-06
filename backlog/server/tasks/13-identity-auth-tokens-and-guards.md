# server — identity: auth tokens, refresh rotation, guards

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#13](https://github.com/ekoz-chat/server/issues/13)

Reference: [../features/identity-and-profiles/technical.md §7, §11](../features/identity-and-profiles/technical.md#7-tokens),
[ADR 0008](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0008-auth-and-sessions.md).

## To do

1. Prisma models: `Session`, `RefreshToken` (§4).
2. Access token: JWT `EdDSA` signed with the active server key (`SigningService`),
   claims `iss/sub/sid/iat/exp`, TTL `auth.access_token_ttl`.
3. Refresh token: 32 random bytes, base64url, stored SHA-256-hashed; one usable
   per session.
4. `POST /auth/login` (`identifier` = name / name/server / email), status +
   verification checks, session creation, `auth.max_sessions_per_user` eviction.
5. `POST /auth/refresh`: rotation + **reuse detection** (used token → revoke the
   whole session, audit `auth.refresh_reuse_detected`).
6. `POST /auth/logout`: revoke current session.
7. `AuthGuard` (verify JWT, check session not revoked via an in-memory revoked-`sid`
   denylist, check `user.status = active`), `OwnerGuard`, populate the request
   context `userId`/`sessionId`.

## Dependencies

- [12-identity-user-model-and-identifier](12-identity-user-model-and-identifier.md)
- server-core [#5 signing keys](5-crypto-and-signing-keys.md), [#3 HTTP conventions](3-http-conventions.md)
