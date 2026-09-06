# server — identity: email verification and email change

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/identity-and-profiles/technical.md §9](../../features/identity-and-profiles/technical.md#9-email-verification).

## To do

1. Prisma model: `EmailVerification` (§4).
2. `POST /auth/verify-email` `{ token }` → consume, set `user.emailVerifiedAt`,
   audit; already-verified → `200`.
3. `POST /auth/verify-email/resend` `{ email }` → always `202`, sends only for an
   existing active unverified account.
4. `POST /me/email` `{ newEmail, password }` → verification for the new address;
   change applied only on verification; old address gets `email-changed-notice`.
5. Mail templates `email-verification`, `email-changed-notice` (server-core
   `Mailer`).
6. Login gate: block login while `email.verification_required` and not verified
   (`403 identity.email_not_verified`).

## Dependencies

- [12-identity-user-model-and-identifier](server-12-identity-user-model-and-identifier.md)
- server-core [#10 outbound email](server-10-outbound-email.md)
