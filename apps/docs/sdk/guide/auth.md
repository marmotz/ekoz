---
sidebar_position: 2
---

# Authentication and sessions

## Read the server policy

`client.auth.policy()` needs no session. It reports the registration mode, whether
email verification is required and the minimum password length, so a sign-up form can
adapt before the user types anything.

## Register

`auth.register` returns the created `AccountView` only, with **no tokens**. Follow up
with `auth.login`, after an email-verification step when the server requires it:

```ts
await client.auth.register({ name, email, password, displayName });
// Email verification required: wait for the emailed link, or offer
// client.auth.resendVerification(...), before signing in.
await client.auth.login({ identifier, password });
```

Registration depends on the server's `registration.mode`:

- `open`: anyone can register.
- `invite`: `invitationToken` is required.
- `admin`: the endpoint is closed (`RegistrationClosedError`); an owner creates
  accounts through `client.admin`.

## Sign in and out

```ts
await client.auth.login({ identifier: 'alice/ekoz.example.com', password });
// ...
await client.auth.logout();
```

Password reset is a two-step flow: `auth.requestPasswordReset` sends the email and
`auth.confirmPasswordReset` consumes the token it carries.

## Persist the session

The SDK never touches `localStorage` or any other storage on its own. Persistence is
delegated to a `SessionStore` you pass to `createClient`. Only
`{ refreshToken, sessionId, identifier }` is stored: the access token is short-lived
and minted again from the refresh token.

When `store` is omitted the SDK uses `memoryStore()`, lost on process restart. In a
browser, back it with `localStorage`:

```ts
import { createClient, type SessionState, type SessionStore } from '@ekozhq/sdk';

function localStorageSessionStore(key = 'ekoz.session'): SessionStore {
  return {
    load: () => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as SessionState) : null;
    },
    save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    clear: () => localStorage.removeItem(key),
  };
}

const client = createClient({
  server: 'ekoz.example.com',
  store: localStorageSessionStore(),
});
```

`load`, `save` and `clear` may also return promises.

## Resume after a restart

On start-up, call `client.session.resume()` to mount the persisted refresh token and
force a fresh access token before the first request. A stale or reused refresh token
surfaces as a `session:invalid` event and leaves the client unauthenticated rather than
throwing.

```ts
await client.session.resume();
```

`client.session.getState()` returns `{ identifier, sessionId }` for the current session,
or `undefined` when signed out. `client.session.clear()` drops the local session without
calling the server.

## Session events

```ts
client.on('session:authenticated', ({ identifier, sessionId }) => {});
client.on('session:refreshed', ({ sessionId }) => {});
client.on('session:invalid', ({ reason }) => {
  // 'refresh_reuse' | 'refresh_failed' | 'logout' | 'account_suspended'
  redirectToLogin();
});
client.on('session:cleared', () => {});
```

Each `on` returns an unsubscribe function; `off` and `once` are also available. The
event stream closes itself on `session:invalid`.

## Errors

Every failure rejects with an `EkozError` subclass chosen from the server's stable
error `code`: `InvalidCredentialsError`, `EmailNotVerifiedError`, `AccountSuspendedError`,
`ValidationError`, `NotFoundError`, `RateLimitError`, `NetworkError`, and so on. A code
the SDK does not know degrades to the base `EkozError`, so new server codes never break
an existing `catch` block. Use `instanceof` to branch.

If the server advertises no protocol major the SDK supports, `createClient` rejects
its first request with `ProtocolMismatchError` (fields `supported` and `advertised`)
before any resource call is attempted.

See the full list in the [API reference](../api/index.md).
