# Protocol changelog

Notable changes to the Ekoz protocol, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[SemVer](https://semver.org/). The protocol is currently at major `0`: minor
versions may still contain breaking changes, flagged below.

## [Unreleased]

### Added

- Transport conventions: `application/problem+json` errors with a stable `code`,
  ULID identifiers, UTC ISO-8601 timestamps, `X-Request-Id` correlation, and the
  `X-Ekoz-Protocol` request header checked against the discovery `protocol_versions`.
- [Discovery](discovery.md): `GET /.well-known/ekoz`, request and caching rules,
  response fields, and the active/retired Ed25519 signing-key semantics.
- [Identity and profiles](identity.md): setup, registration (`open`, `invite`,
  `admin`), login, refresh and logout, sessions, email verification, password reset,
  own and public profiles, invitations and owner administration, with a full
  `auth.*` / `identity.*` error code reference. Later additions: `GET /auth/policy`,
  `POST /me/password`, `GET /me/username`, `DELETE /me/username/request`,
  `MeView.pendingEmail`, `GET /users?ids=`, versioned `avatarUrl`, and the admin
  settings and storage routes.
- [Spaces, rooms, roles and permissions](rooms-and-permissions.md): room hierarchy
  CRUD and move, the capability ACL, the membership lifecycle (join, leave, invite,
  join requests, kick, ban, role change), direct and group conversations, the public
  directory, room groups, history floors, `GET /rooms`, `GET /rooms/:id/preview`,
  `GET /rooms/:id/members`, `GET /me/conversations`, `GET /me/contacts`, and the
  `room_*` / `member_*` / `permission_override_changed` / `group_changed` events.
- [Messages and interactions](messages-and-interactions.md): send, edit, delete,
  restricted-Markdown grammar, structured mentions (`user`, `all`, role and group
  targets), replies, pins, reactions, read markers, paginated history
  (`before`, `after`, `around`), `GET /messages/policy`, `GET /me/mentions`,
  attachments and link previews.
- [Presence and typing](presence-and-typing.md): per-client heartbeats,
  `PUT /presence/preference`, presence frames pushed on change with a snapshot when
  the stream opens, and ephemeral typing signals.
- [Synchronisation](synchronisation.md): `GET /sync` and the `GET /events` SSE stream
  with the per-account `feedSeq` cursor.
- [Files and sharing](files-and-sharing.md): resumable uploads (tus 1.0 core plus
  creation, termination and expiration), signed download URLs, `GET /me/storage`,
  link previews, and the `upload.*`, `files.*` and `link_preview.*` error codes.
- Room creation makes the creator a member (`space_admin` for a space, `room_admin`
  for a channel), so a room has a member from its first event.
- `message_deleted` room event, and `messageId` on `message_edited`.

### Changed

- **Breaking.** `Message.mentions` and `message_created.content.mentions` are mention
  targets `{ type, target, token }` instead of user ids, and `POST /rooms/:id/messages`
  takes target inputs instead of user ids. A mentioned user must be an effective member
  of the room, ancestor space members included.
- **Breaking.** `GET /events` without `Last-Event-ID` or `?lastEventId=` starts at the
  current head of the account feed instead of replaying it. Clients read `GET /sync`
  or `GET /rooms/:id/messages` for history.
- **Behaviour change.** A member can have a history floor: message reads, pins and
  `GET /sync` hide what precedes it, and a message below it answers `message.not_found`.
- Room events are fanned out to the effective members of a room, ancestor spaces
  included, instead of the explicit members only.
- Presence is aggregated per client instance and pushed when a status changes, and
  presence and typing are evaluated per recipient at emission.
- Read markers are available to effective members, including those inherited from an
  ancestor space.
- Deleting a message also rewrites its mirrored account feed rows, so `GET /events` no
  longer replays the deleted body.
- `POST /dms` and `POST /group-dms` answer `room.user_not_found` (`422`) for an unknown
  or inactive user, and `POST /dms` reopens a conversation the caller deleted.
- `PUT /me/avatar` counts against the account's storage quota and can answer
  `upload.quota_exceeded` (`403`).

### Fixed

- A wrong password on `POST /me/email` and `DELETE /me` is documented as `401`
  `auth.invalid_credentials`, as servers have always answered (it was `403`).
