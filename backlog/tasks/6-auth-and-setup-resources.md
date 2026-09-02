# sdk-js — setup and auth resource bindings

**Status**: todo
**Type**: sdk
**Issue**: [#6](https://github.com/ekoz-chat/sdk-js/issues/6)

Reference: [../features/sdk-foundations/technical.md §10](../features/sdk-foundations/technical.md#10-surface-publique), [§7](../features/sdk-foundations/technical.md#7-cycle-de-vie-tokens-et-sessions--sessionmanager).

## Verified findings

- `POST /setup/owner` → tokens + owner account
  ([setup.controller.ts:19](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/setup.controller.ts#L19),
  [setup-owner.service.ts:19](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/setup-owner.service.ts#L19)).
- `POST /auth/login` → `{ accessToken, refreshToken, expiresIn, session }`
  ([auth.controller.ts:20](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/auth/auth.controller.ts#L20)).
- `POST /auth/register` → `AccountView` only, **no tokens**
  ([registration.controller.ts:25](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/registration.controller.ts#L25));
  modes `open` / `invite` (needs `invitationToken`) / `admin`.
- `POST /auth/verify-email` + `/resend`, `POST /auth/password-reset/request` + `/confirm`
  ([email-verification.controller.ts:25](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/email-verification/email-verification.controller.ts#L25),
  [password-reset.controller.ts:22](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/password-reset.controller.ts#L22)).

## To do

1. `src/resources/setup.ts`: `setup.createOwner(body)` → establishes the
   session via `SessionManager`.
2. `src/resources/auth.ts`:
   - `register(body)` (single method, `invitationToken` optional) → `AccountView`.
   - `login(body)` → establishes the session.
   - `logout()` delegates to `SessionManager`.
   - `verifyEmail({ token })`, `resendVerification({ email })`.
   - `requestPasswordReset({ email })`, `confirmPasswordReset({ token, newPassword })`.
3. Wire the `session:authenticated` emission through login/setup.
4. Unit tests (mocked fetch): each call hits the right path/verb/body; login
   populates the store; register does not; `auth.invalid_credentials` surfaces
   as `InvalidCredentialsError` without a refresh attempt.

## Dependencies

[5-client-assembly-and-wire-types](5-client-assembly-and-wire-types.md).
