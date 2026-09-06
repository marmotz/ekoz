# server — identity: throttle on credential endpoints

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/identity-and-profiles/technical.md §14](../../features/identity-and-profiles/technical.md#14-abuse-protection-on-sensitive-endpoints).

## To do

1. A narrow, self-contained fixed-window in-memory counter (per instance) keyed
   by client IP + target identifier/email.
2. Apply to `POST /auth/login`, `/auth/register`,
   `/auth/password-reset/request`, `/auth/verify-email/resend`.
3. Limits from `auth.sensitive_throttle` (`{ window, max }`); over the limit →
   `429` problem+json with `Retry-After`.
4. This is a deliberate minimal exception to "general rate limiting deferred";
   document it as such in the code and the changelog.

## Dependencies

- [13-identity-auth-tokens-and-guards](server-13-identity-auth-tokens-and-guards.md)
- [15-identity-registration-and-invitations](server-15-identity-registration-and-invitations.md)
- [16-identity-email-verification](server-16-identity-email-verification.md)
- [17-identity-password-reset](server-17-identity-password-reset.md)
