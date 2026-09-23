# Protocol changelog

All notable changes to the Ekoz protocol. Format
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- Initial protocol skeleton: transport principles (HTTP + SSE + signed
  server↔server REST), per-room event model with a monotonic `seq`, list of
  sections to write.
- Transport conventions: `application/problem+json` errors with a stable `code`,
  ULID identifiers, UTC ISO-8601 timestamps, `X-Request-Id` correlation
  (see the HTTP API conventions design).
- Transport: `X-Ekoz-Protocol` request header carrying the protocol major, with
  a client-side compatibility gate against the discovery `protocol_versions`
  (see the SDK packaging and protocol-version policy design).
- Discovery document at `GET /.well-known/ekoz` fully specified in
  [`discovery.md`](discovery.md): request/caching rules, response fields,
  `KeyEntry` shape (raw base64 Ed25519 `public_key`, `valid_from`,
  `valid_until`), and active/retired signing-key semantics with `keyId` lookup.
- Identity surface (draft): `name/server` identifier rules, auth token model
  (JWT access + rotating opaque refresh, reuse detection), session objects,
  SSE stream ticket.
- Public `GET /auth/policy` in [`identity.md`](identity.md): registration mode,
  email-verification requirement and minimum password length, read live and
  never cached.
- `POST /me/password` in [`identity.md`](identity.md): change the password of the
  signed-in account, keeping the calling session and revoking the others.
- `GET /me/username` and `DELETE /me/username/request`: identifier change state
  (policy, cooldown end, pending request) and cancellation; new `cancelled`
  request status and `identity.username_request_pending` error (`409`).
- `MeView.pendingEmail`: the unverified address of a requested email change.
- Every `avatarUrl` ends with `?v=<avatarBlobId>`, an opaque version that changes
  with the avatar content.
- [Identity and profiles](identity.md) fully specified: setup, registration
  (`open` / `invite` / `admin`), login / refresh / logout, sessions, email
  verification, password reset, own and public profiles, invitations, owner
  administration — method, path, request body, success shape and
  `problem+json` `code` per endpoint, plus a full `auth.*` / `identity.*` code
  reference table.
- Conversations surface (draft): `room` object with `type`, capability list and
  permission resolution, `room_event` types and per-room `seq`,
  `GET /sync` and `GET /events` (per-account fan-in feed with its own cursor),
  restricted-Markdown message body, structured mentions, read markers,
  presence/typing signals.
- [Spaces, rooms, roles and permissions](rooms-and-permissions.md) fully
  specified for room hierarchy CRUD/move and the capability ACL (issues
  #1-#3): method, path, request body, success shape and `problem+json` `code`
  per endpoint, the `room_*` / `permission_override_changed` event payloads,
  and the capability/role lists.
- [Spaces, rooms, roles and permissions](rooms-and-permissions.md) extended
  with the membership lifecycle (issue #4): `Membership` / `Invitation` /
  `JoinRequest` objects, join / leave / invite / accept / decline /
  join-request / approve / reject / kick / ban / unban / role-change
  endpoints, real membership-based effective-role resolution (replacing the
  `public`-room-only provisional rule), and the `member_*` / `role_changed`
  event payloads.
- [Messages and interactions](messages-and-interactions.md),
  [Presence and typing](presence-and-typing.md) and
  [Synchronisation](synchronisation.md) (issue #38): restricted-Markdown
  grammar, structured mentions, message/pin/reaction/receipt endpoints and
  event payloads, presence/typing semantics, `GET /sync` and `GET /events`
  with the per-account `feedSeq`. Written ahead of the server implementation
  (issues #7-#11) from the settled technical design.
- [Spaces, rooms, roles and permissions](rooms-and-permissions.md) extended
  with direct/group conversations and the public directory (issues #5-#6):
  `POST /dms` (dedup via `dmKey`), `POST /group-dms`, the `dm`/`group_dm`
  leave-hides-not-removes rule, `GET /directory`,
  `POST /rooms/:id/publish|unpublish`.
- [Messages and interactions](messages-and-interactions.md) reconciled against
  the real server (issues #7-#9): fixed `message_created` / `message_edited` /
  `message_redacted` / `reaction_added` / `reaction_removed` event payloads
  (`message_redacted` rewrites the original event in place rather than
  appending), corrected status codes (reactions are not idempotent, receipts
  need actual `Membership` not just `room.read`, pins return the pin row not
  the message), and the restricted-Markdown allowlist's actual scope (a bare
  autolinked URL is allowed, same as an explicit `[]()` link).
- [Presence and typing](presence-and-typing.md) and
  [Synchronisation](synchronisation.md) reconciled against the real server
  (issue #10-#11): heartbeat is `{ away? }` → `{ status }` (not `{ status? }` →
  `204`), `GET /sync` returns `lastSeq` (not `roomSeq`), `GET /events` frames
  carry `roomId` folded into `data`, delivery is poll-based (not push) for the
  durable half with ephemeral presence/typing pushed live in-process, and
  feed pruning is age-only (no per-session acked-`feedSeq` floor yet).
- Room creation makes the creator a member (`space_admin` for a space,
  `room_admin` for a channel): `POST /spaces` and `POST /rooms` append
  `member_joined` right after `room_created`. Behaviour change: a room now has
  a member from its first event, so its `seq` values shift by one.
- `GET /rooms/:id/preview` in [`rooms-and-permissions.md`](rooms-and-permissions.md):
  name, topic and the caller's own join request state for an invite-only room a
  non-member cannot read.
- `GET /me/room-invitations` and the shared `UserSummary` object in
  [`rooms-and-permissions.md`](rooms-and-permissions.md): the caller's pending
  room invitations with the room and the inviter embedded.

- `GET /rooms/:id/messages` in [`messages-and-interactions.md`](messages-and-interactions.md):
  paginated history, newest page first, with a `before` `seq` cursor.
- `GET /rooms/:id/members` in [`rooms-and-permissions.md`](rooms-and-permissions.md):
  the effective members of a room, ancestor spaces included, each with a
  `UserSummary`.
- `message_deleted` room event, appended when a message is deleted (by its
  author, a moderator or retention) so connected clients see the deletion.
  `message_edited` now carries `messageId`.

### Changed

- Deleting a message also rewrites the account feed rows that mirrored the
  original `message_created`, so `GET /events` no longer replays the deleted
  body.
- `GET /events` without `Last-Event-ID` or `?lastEventId=` starts at the
  current head of the account's feed instead of replaying the retained feed.
  Behaviour change for clients that relied on a full replay: they must read
  `GET /sync` (or `GET /rooms/:id/messages`) for history.
- Room events are fanned out to the effective members of the room, ancestor
  spaces included, instead of the explicit members only.

### Fixed

- A wrong password on `POST /me/email` and `DELETE /me` is documented as `401`
  `auth.invalid_credentials`, as the server has always answered (was `403`).
