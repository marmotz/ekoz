# Identity and profiles

**Status**: [technical design](technical.md)

## Context

The server must be operable by an individual as well as an organisation. It
therefore needs autonomous management of accounts and profile information,
without imposing an external identity provider in the first increment.

## Goal

Allow creation and administration of local accounts, with password
authentication, profile and avatar. External identity integrations can be added
later.

## Decisions made

- Every account has a stable public identifier of the form `name/server`, for
  example `alice/chat.example` (displayed as `@alice/chat.example`). It is
  distinct from the display name. The `name` is lowercase, restricted to the
  characters `[a-z0-9_.-]`, at most 64 characters, unique on its server,
  unrelated to the display name. The `server` is a real domain (no `localhost`).
  See [ADR 0007](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0007-user-identifier.md).
- The server administrator chooses whether registration is open, invite-only or
  reserved to administrators.
- A mandatory, verified email address enables account recovery and email
  notifications. The server owner can disable verification for deployments
  without a mail server.
- A reset email allows regaining access to an account.
- Multi-factor authentication is planned for a later increment.
- Authentication uses a short-lived JWT access token + an opaque refresh token;
  named multi-device sessions, revocable by the user or by the server
  (suspension). See [ADR 0008](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0008-auth-and-sessions.md).
- The public profile contains a display name, an avatar and a short biography.
- The server owner configures the identifier change policy: immutable identifier,
  free change subject to availability, or change subject to administrative
  approval.
- Deleting an account erases its profile data and anonymises the author of its
  retained messages.

## Feature order

- [Conversations](../conversations/overview.md) use the accounts and profiles
  managed by this feature.
- [Server administration](../server-administration/overview.md) manages accounts
  and roles at the server scale.
- [Notifications](../notifications/overview.md) use the verified email address
  and account preferences.
- [Federation](../federation/overview.md) relies on the identifier and profile
  of the home server.
