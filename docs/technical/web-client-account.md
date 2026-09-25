# Web client account

## Context

The identity server and SDK already covered profile, avatar, email change, username
change, self-deletion and sessions, but `apps/client-web` had no screen for any of it.
The `identity-and-profiles` client scope adds the signed-in user's `/account` page and
closes three gaps on the server that the page could not work around.

Three constraints shaped it:

- Every network call goes through `@ekozhq/sdk` (see the conventions in
  [AGENTS.md](../../AGENTS.md)); a feature may not import another feature (see the
  boundaries table in [web client bootstrap](web-client-bootstrap.md)).
- `GET /users/:identifier/avatar` needs a Bearer token, so an `<img src>` cannot load it.
- The menu and sign-out belong to `auth` ([web client authentication](web-client-auth.md));
  this feature can only contribute to it.

The feature-level design is in
[`backlog/_archives/features/identity-and-profiles/technical.md`](../../backlog/_archives/features/identity-and-profiles/technical.md)
(§21 to §28); this page records what shipped and why. The server rules it relies on are
in [identity lifecycle and abuse protection](identity-lifecycle-and-abuse-protection.md).

## Decision

### Code layout

```
src/features/profile/
  api/         query keys, error-to-message table
  hooks/       one hook per SDK call (queries and mutations), form error state
  components/  one component per /account section, delete dialog
  routes/      AccountPage (composes the sections)
src/routes/_app/account.tsx           thin route, registers the menu entry
src/shared/layout/user-menu-items.ts  user-menu entries registry
src/shared/sdk/{use-me,use-avatar-src}.ts
src/shared/ui/{user-avatar,textarea,dialog,password-input,form-field}.tsx
```

`useMe`, `useAvatarSrc` and `UserAvatar` sit in `shared` so that the rooms and chat
features can show authors without importing this one.

### User menu entries registry

`UserMenu` is owned by `auth`, so `profile` cannot import it and `auth` cannot import
`profile`. `shared/layout/user-menu-items.ts` is the meeting point, the same pattern as
`registerNav`: `registerUserMenuItem({ id, to, labelKey, icon, order })`, de-duplicated
by `id` (the first registration wins), read sorted by `order` through
`getUserMenuItems()`. `routes/_app/account.tsx` registers the `account` entry when the
route module is imported, and `UserMenu` renders the registered entries above "Sign out".
Sign out is unchanged: it only calls `sdk.auth.logout()` and `SessionGuard` redirects.

### Avatar rendering

The avatar is fetched as a blob through the SDK (`users.avatar(identifier, { version })`,
`HttpClient` in `responseType: 'blob'` mode, so refresh-and-replay on `401` still
applies) and shown from an object URL.

- `useAvatarSrc(identifier, avatarUrl)` is a TanStack Query keyed by `['avatar', avatarUrl]`
  with `staleTime: Infinity`. The object URL is created in an effect and revoked on cleanup
  or change.
- Every `avatarUrl` the server emits ends with `?v=<avatarBlobId>`. Because blobs are
  deduplicated by content, the version changes exactly when the avatar does: a new upload
  changes the query key and refetches, an unchanged avatar is never fetched twice, and no
  manual invalidation exists.
- `UserAvatar` shows the initials of the display name while loading, on error and when
  there is no avatar. It is the only avatar component; the user menu, the avatar editor
  and any future author display use it.

### The `/account` page

One route (`/_app/account`, `staticData.title = 'account.title'`), under the `_app`
layout so `RequireAuth` protects it. `AccountPage` reads `useMe()` (key `['me']`),
shows a skeleton while it loads and a generic error if it fails, then renders the
sections in this order. Forms use the generated TanStack Form hooks described in
[web client authentication](web-client-auth.md); submitting goes through the SDK.

| Section     | Behaviour                                                                                                                                                                                                                                                                                | SDK calls                                                          |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| Profile     | Display name and biography; on success `['me']` is replaced by the returned view.                                                                                                                                                                                                        | `me.updateProfile`                                                 |
| Avatar      | File input restricted by `accept`, upload and remove; on success the `avatarUrl` in `['me']` is replaced.                                                                                                                                                                                | `me.setAvatar`, `me.deleteAvatar`                                  |
| Identifier  | Driven by `['account', 'username-state']`: `immutable` is a read-only note; `available` is a form, disabled with the date while `nextChangeAt` is in the future; `approval` is a form with a note; a `pendingRequest` replaces the form by "awaiting approval" and a Cancel button.      | `me.usernameState`, `me.changeUsername`, `me.cancelUsernameRequest` |
| Email       | Current address and its verification state. With `pendingEmail`, a notice and a "Resend" that asks for the password and re-submits that address. Form: new address and current password.                                                                                                | `me.changeEmail`                                                   |
| Password    | Current, new, confirmation. Success says other devices were signed out, clears the fields and invalidates the sessions list.                                                                                                                                                             | `me.changePassword`                                                |
| Sessions    | Active sessions only (`revokedAt === null`), newest `lastSeenAt` first, the current one flagged and without a revoke button; inline rename, revoke, "Sign out other sessions".                                                                                                          | `sessions.list`, `.rename`, `.revoke`, `.revokeAllOthers`          |
| Danger zone | `DeleteAccountDialog`: consequences, password, confirm. On success `queryClient.clear()`; the SDK has already cleared the session, `useSession()` follows, `RequireAuth` redirects to `/login`.                                                                                          | `me.deleteAccount`                                                 |

Two details are easy to get wrong:

- The identifier shown to the user comes from `useMe()`, never from `useSession()`: the
  SDK session keeps the identifier it got at login, so it is stale after a username
  change.
- `GET /sessions` also returns revoked sessions; the client filters them out. A revoked
  session cannot refresh, so revoking is enough to cut a device.

### Error mapping

As in the authentication feature, errors are mapped by their stable `code`, in one table
(`features/profile/api/error-messages.ts`), because not every code has an SDK class.
`mapAccountError` returns `{ code, message }`; `RateLimitError` uses `retryAfter`,
`NetworkError` and anything unknown fall back to a generic message. `useAccountError`
holds the message of the last failed call of a section (rendered by `FormError` and
`FormField` with `role="alert"`) and exposes the code so a section can react to it.

| Code                                                                                                        | Shown                                                                          |
|-------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `auth.invalid_credentials`                                                                                  | wrong password (the SDK maps it to `InvalidCredentialsError`, which does not sign the user out) |
| `identity.password_too_weak`                                                                                | password rejected (also a new password equal to the current one)               |
| `identity.email_taken`                                                                                      | address already used                                                           |
| `identity.identifier_invalid`, `identity.username_taken`                                                    | identifier rules, identifier unavailable                                       |
| `identity.username_immutable`, `identity.username_change_cooldown`, `identity.username_request_pending`    | message, then the username state is refetched                                  |
| `identity.profile_invalid`                                                                                  | biography too long                                                             |
| `identity.avatar_too_large`, `identity.avatar_rejected`                                                     | avatar message                                                                 |
| `identity.last_owner`                                                                                       | the only owner must promote another one first                                  |

All strings live under `account.*` in the `common.json` catalogues, French and English.

### Server decisions

Three changes were made on the server for this page. Each was written up in the
protocol page ([identity](../protocol/identity.md)) and the protocol
[changelog](../protocol/CHANGELOG.md) first.

#### Password change revokes the other sessions

`POST /me/password` `{ currentPassword, newPassword }` re-authenticates with the current
password, applies the registration password policy, then revokes every other session and
keeps the calling one. Audited as `auth.password_changed`.

| Alternative                               | Why not                                                                                   |
|-------------------------------------------|-------------------------------------------------------------------------------------------|
| `PATCH /me` with a password field         | `PATCH /me/profile` stays non-sensitive; `POST /me/email` sets the action style.          |
| Reuse the password reset flow             | It needs a mail round trip for a user who is already signed in.                           |
| Optional "sign out other devices" toggle  | A changed password exists to cut a stolen session; a default that keeps it is the wrong one. |
| No revocation                             | Same reason.                                                                              |

Consequences: the other devices get a `401` at their next request and land on the sign-in
page. No notification mail is sent, and the password check is not covered by the
credential-endpoint throttle (its key is the IP plus an `identifier` or `email` body
field, which these bodies do not carry); brute force needs a valid access token.

#### One cancellable username request

In `approval` mode a user has at most one pending `username_change_request`; a second
attempt answers `409 identity.username_request_pending`. `DELETE /me/username/request`
sets it to the new `cancelled` status, and `GET /me/username` returns the policy, the end
of the cooldown and the pending request in one call.

| Alternative                          | Why not                                                                   |
|--------------------------------------|---------------------------------------------------------------------------|
| Several pending requests             | Unbounded owner workload, and no way for the user to withdraw one.        |
| A new request silently replaces      | The user would lose track of what an owner is about to approve.           |
| Policy and state fields in `MeView`  | `MeView` is fetched everywhere; the state is needed on one page and costs config and audit reads. |

Consequences: `UsernameChangeStatus` gains `cancelled`. `approve` and `reject` already
refuse a non-pending row, and the admin console only requests the `pending`, `approved`
and `rejected` filters, so it is unaffected.

#### Versioned `avatarUrl`

The server appends `?v=<avatarBlobId>` to every `avatarUrl`; the builders are shared
helpers in `core/http/user-links.ts`, so modules that cannot import `identity` emit the
same URL.

| Alternative                                                   | Why not                                                                              |
|---------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `no-cache` with ETag revalidation                             | Costs a round trip per avatar per view, and the client query would not know about a change. |
| Token in the query string, cookie auth, signed short-lived URLs | New mechanisms nobody else needs yet; a token in a URL leaks into logs and history.   |

Consequences: the avatar route ignores `v` and keeps its `private, immutable` cache, now
correct because the URL changes with the content. Any client that builds its own avatar
URL instead of using the emitted one would lose the busting.

## Alternatives

| Topic              | Chosen                                                              | Rejected                                        | Why                                                                                          |
|--------------------|---------------------------------------------------------------------|-------------------------------------------------|----------------------------------------------------------------------------------------------|
| Avatar to the browser | Authenticated blob through the SDK, object URL                   | See "Versioned `avatarUrl`"                     | The SDK is the only network path.                                                            |
| User menu          | `auth` owns it; entries come from a `shared/layout` registry        | A second menu here; importing `auth`'s menu     | A feature cannot import another; the registry matches `registerNav`.                         |
| Pending email      | `pendingEmail` in `MeView`, from the unconsumed verification row   | A separate endpoint                             | One extra lookup, no new column, on a call the page already makes.                           |
| Resending          | Re-submit `POST /me/email` with the password                        | `POST /me/email/resend` without a password      | No new endpoint; the price is one more notice mail to the old address per resend.            |
| Forms              | Generated TanStack Form hooks, like `auth`                          | Native controlled forms                         | One form style in the client.                                                                |
| Deleting an account | The mutation clears the query cache; the redirect follows the session | Navigate in the mutation handler              | One mechanism per transition, as for sign in and sign out.                                   |

## Consequences

- Every page that needs an avatar uses `UserAvatar`: one authenticated fetch per distinct
  `avatarUrl`, cached for the session.
- A new user-menu entry is a `registerUserMenuItem` call in its route module, nothing in
  `auth`.
- A new error code shown on `/account` needs a row in `ACCOUNT_ERROR_TABLE` and a key in
  both `account.errors.*` catalogues; an unmapped code degrades to the generic message.
- A new account form needs its DTO in the generator configuration and a
  `bun run generate`.
- Known limitations: no client-side upload size or type check beyond `accept` (the limits
  are server configuration and its errors are mapped); the forms do not know the password
  length policy, which lives in the `auth` feature's `GET /auth/policy` hook, so the server
  error is shown; no mail is sent after a password change.
