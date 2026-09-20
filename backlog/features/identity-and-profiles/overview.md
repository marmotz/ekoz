# Identity and profiles

**Status**: [technical design](technical.md) (§1 to §20 server layer as shipped, §21 to §28 client scope)

## Context

The server must be operable by an individual as well as an organisation. It
therefore needs autonomous management of accounts and profile information,
without imposing an external identity provider in the first increment.

The server-side identity layer and the SDK bindings have shipped; a signed-in
user still has no UI to manage their own account. The former `profile` feature
(client account screens, split out of
[web-client-foundations](../../_archives/features/web-client-foundations/overview.md)) is merged
here, so this feature now spans `apps/server`, `packages/sdk` and
`apps/client-web`. Sign-in and registration flows stay in
[`auth`](../auth/overview.md).

## Goal

Allow creation and administration of local accounts, with password
authentication, profile and avatar. External identity integrations can be added
later. A signed-in user can read and update their profile (display name,
avatar, biography), change their username, email and password, list, rename and
revoke their active sessions, and delete their account, from the demonstration
web client against a running reference server.

## Decisions made

- Every account has a stable public identifier of the form `name/server`, for
  example `alice/chat.example` (displayed as `@alice/chat.example`). It is
  distinct from the display name. The `name` is lowercase, restricted to the
  characters `[a-z0-9_.-]`, at most 64 characters, unique on its server,
  unrelated to the display name. The `server` is a real domain (no `localhost`).
  See [user identifier](../../../docs/technical/user-identifier.md).
- The server administrator chooses whether registration is open, invite-only or
  reserved to administrators.
- A mandatory, verified email address enables account recovery and email
  notifications. The server owner can disable verification for deployments
  without a mail server.
- A reset email allows regaining access to an account.
- Multi-factor authentication is planned for a later increment.
- Authentication uses a short-lived JWT access token + an opaque refresh token;
  named multi-device sessions, revocable by the user or by the server
  (suspension). See [authentication and sessions](../../../docs/technical/auth-and-sessions.md).
- The public profile contains a display name, an avatar and a short biography.
- The server owner configures the identifier change policy: immutable identifier,
  free change subject to availability, or change subject to administrative
  approval.
- Deleting an account erases its profile data and anonymises the author of its
  retained messages.
- The client part lives in `src/features/profile/{api,components,hooks,routes}` of
  `apps/client-web`; all network access goes through
  [`@ekozhq/sdk`](../../_archives/features/sdk-foundations/overview.md).
- **Client scope** (existing server endpoints and SDK bindings are reused for
  profile, avatar, email and username change, sessions and account deletion;
  three gaps are closed as part of this feature, each server -> SDK -> client):
  - **Password change while signed in**: new server endpoint (and SDK binding)
    requiring the current password. On success every other session of the user is
    revoked; the current session stays open. Aligned with password reset, which
    revokes all sessions. Documented first in the
    [identity protocol](../../../docs/protocol/identity.md).
  - **Username change state**: the server exposes to the signed-in user the
    active `identity.username_change_policy`, the cooldown, and their pending
    change request (`approval` mode). The client hides or disables the form when
    the policy is `immutable` and shows "pending approval" while a request is
    open. A user has at most one pending request and can cancel it to submit
    another.
  - **Pending email change**: the server exposes the not-yet-verified new address
    in the account view. The client shows "verification pending for <address>"
    with a resend action, which re-submits the change and asks for the password
    again.
- **Account deletion is in scope**: a danger zone requiring the password,
  explaining that profile data is erased and message authorship anonymised,
  handling the sole-owner refusal (`identity.last_owner`), then signing the user
  out.
- **Screens**: a single `/account` route with sections (profile: display name,
  biography, avatar; identifier; email and password; sessions; danger zone),
  reached from the user menu of the app shell. The `/account` sections are not
  split into separate routes.
- **The user menu belongs to [`auth`](../auth/overview.md)** (display name and
  "Sign out"); this feature adds the "Account" entry and the avatar image to it.
- **Forms** are generated like those of `auth` (kurotako `gen-react` with TanStack
  Form), so the account screens wait for that generator to be published.

## Dependencies

- [`auth`](../auth/overview.md) — the client account screens require a signed-in
  session.
- [web-client-foundations](../../_archives/features/web-client-foundations/overview.md) — bootstrap
  and layout of the client.
- [`web-client-rooms`](../web-client-rooms/overview.md) — its issue
  [#65](https://github.com/marmotz/ekoz/issues/65) creates the shared `useMe` hook
  the account screens use.
- [`auth`](../auth/overview.md) issues [#92](https://github.com/marmotz/ekoz/issues/92)
  (layouts, UI base), [#93](https://github.com/marmotz/ekoz/issues/93) (user menu) and
  [#94](https://github.com/marmotz/ekoz/issues/94) (generated forms).

## Feature order

- Client order: `web-client-foundations` -> [`auth`](../auth/overview.md) ->
  the client part of this feature.
- Within the client part: server gaps first, then their SDK bindings, then the
  `/account` screens that use them.

- [Conversations](../../_archives/features/conversations/overview.md) use the accounts and profiles
  managed by this feature.
- [Server administration](../../_archives/features/server-administration/overview.md) manages accounts
  and roles at the server scale.
- [Notifications](../notifications/overview.md) use the verified email address
  and account preferences.
- [Federation](../federation/overview.md) relies on the identifier and profile
  of the home server.
