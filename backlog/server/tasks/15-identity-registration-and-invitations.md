# server — identity: registration modes and invitations

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#15](https://github.com/ekoz-chat/server/issues/15)

Reference: [../features/identity-and-profiles/technical.md §8](../features/identity-and-profiles/technical.md#8-registration).

## To do

1. Prisma model: `Invitation` (§4).
2. `POST /auth/register` for the three `registration.mode` values:
   - `open`: `{ name, email, password, displayName }`;
   - `invite`: also `{ invitationToken }`, validated (unconsumed, unexpired,
     email match if bound);
   - `admin`: returns `403 identity.registration_closed`.
3. Minimal password policy (length ≥ 10, small common-password denylist).
4. Create `User` + `UserProfile` + consume invitation in one transaction; set
   `emailVerifiedAt` now or trigger verification per
   `email.verification_required`.
5. `POST /admin/users` (owner) to create accounts in `admin` mode.
6. Invitations (owners only for now): `POST /invitations` `{ email?, expiresInDays? }`
   → `{ id, token, url }`; `GET /invitations`; `DELETE /invitations/:id`.
7. Audit `identity.account_registered`.

## Dependencies

- [12-identity-user-model-and-identifier](12-identity-user-model-and-identifier.md)
- [13-identity-auth-tokens-and-guards](13-identity-auth-tokens-and-guards.md)
- [16-identity-email-verification](16-identity-email-verification.md) (when verification is required)
