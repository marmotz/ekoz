# server — identity: password reset

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/identity-and-profiles/technical.md §10](../../features/identity-and-profiles/technical.md#10-password-reset).

## To do

1. Prisma model: `PasswordReset` (§4), TTL 1h.
2. `POST /auth/password-reset/request` `{ email }` → always `202`; create a
   token + send the `password-reset` mail for an existing active account.
3. `POST /auth/password-reset/confirm` `{ token, newPassword }` → set the new
   hash, **revoke all of the user's sessions**, audit `auth.password_reset`.
4. Mail template `password-reset`.

## Dependencies

- [12-identity-user-model-and-identifier](server-12-identity-user-model-and-identifier.md)
- [14-identity-session-management](server-14-identity-session-management.md)
- server-core [#10 outbound email](server-10-outbound-email.md)
