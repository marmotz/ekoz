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
- Public `GET /messages/policy` in
  [`messages-and-interactions.md`](messages-and-interactions.md): the maximum
  message body length, read live and never cached. The info string of a fenced
  code block is documented as preserved and not validated.
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
- `GET /rooms` in [`rooms-and-permissions.md`](rooms-and-permissions.md): the
  caller's spaces and channels as `RoomListItem`s, each with the caller's `role`
  and an `access` of `member`, `inherited` or `context`.
- `GET /rooms/:id/join-requests` in [`rooms-and-permissions.md`](rooms-and-permissions.md):
  the pending join requests of a room, oldest first and paginated, each with the
  requester's `UserSummary`.
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
- `GET /users?ids=` in [`identity.md`](identity.md): public summaries of up to 100
  users by id, in request order; unknown and deleted ids come back as deleted
  accounts.
- Room groups in [`rooms-and-permissions.md`](rooms-and-permissions.md):
  `GET` / `POST /rooms/:id/groups`, `GET` / `PATCH` / `DELETE /rooms/:id/groups/:groupId`,
  `PUT` / `DELETE /rooms/:id/groups/:groupId/members/:userId`, the
  `room.manage_groups` capability (default for `space_admin` and `room_admin`) and
  the `group_changed` room event.
- `GET /rooms/:id/messages` takes `after` and `around` (at most one of `before`,
  `after`, `around`), and the page carries `hasMoreNewer`.
- Mentions in [`messages-and-interactions.md`](messages-and-interactions.md):
  `all`, role and group targets in channels, `PATCH /rooms/:id/messages/:messageId`
  takes `mentions`, `Message.mentionsMe`, `GET /me/mentions` and
  `GET /me/mentions/unread`, and the `message.mention_invalid` error.
- `RoomListItem.unreadCount` on `GET /rooms` in
  [`rooms-and-permissions.md`](rooms-and-permissions.md): unread messages since the
  read marker (or the join), capped at `100`, `null` for `context` rooms.
- `Message.reactions` in [`messages-and-interactions.md`](messages-and-interactions.md):
  the reactions of a message, grouped by emoji, on every REST response carrying a
  `Message`. Pins embed their `message` on `PUT /rooms/:id/pins/:messageId` and
  `GET /rooms/:id/pins`. `messages/policy` also returns `editWindow`.
- `GET /me/conversations`, `GET /me/contacts` and the `ConversationListItem` object in
  [`rooms-and-permissions.md`](rooms-and-permissions.md): the caller's direct and group
  conversations with their participants and admin flags, and a search of the people
  sharing a room with the caller.
- Group management in [`rooms-and-permissions.md`](rooms-and-permissions.md):
  `PATCH /group-dms/:id`, `POST` / `DELETE /group-dms/:id/members`, `PUT` / `DELETE
  /group-dms/:id/admins/:userId`, the group admin semantics (per-user
  `room.manage_members` override), the 50 member limit, group deletion when no admin
  remains, and the `room.user_not_found` and `room.group_full` errors.
- `id` on the public profile of `GET /users/:identifier` in [`identity.md`](identity.md).
- Message attachments in [`messages-and-interactions.md`](messages-and-interactions.md):
  `Message.attachments`, `POST` / `PATCH /rooms/:id/messages(/:messageId)` accept
  `attachments`, `DELETE /rooms/:id/messages/:messageId/attachments/:attachmentId`,
  `GET /rooms/:id/files`, the `attachment_removed` room event, and the `room.attach`
  capability. (#143)
- Link previews in [`messages-and-interactions.md`](messages-and-interactions.md):
  `Message.linkPreview`, `POST /link-previews`, `POST` / `PATCH
  /rooms/:id/messages(/:messageId)` accept `linkPreviewUrl`, and `linkPreviews` on
  `GET /auth/policy`. (#144)
- Admin settings in [`identity.md`](identity.md): `GET` / `PUT` / `DELETE
  /admin/settings(/:key)` and the `ConfigParameterView` object. (#145)
- Admin storage in [`identity.md`](identity.md): `GET` / `PUT` / `DELETE
  /admin/users/:id/storage(-quota)`, `GET /admin/storage`, `GET
  /admin/attachments`, and `DELETE /admin/blobs/:id`. (#146)
- New [`files-and-sharing.md`](files-and-sharing.md): resumable uploads (tus
  1.0 core plus creation, termination and expiration), signed file download
  URLs, `GET /me/storage`, link previews, and their `upload.*` / `files.*` /
  `link_preview.*` error codes. (#138, #139, #140, #141, #144)

### Changed

- Presence: heartbeats accept an optional `clientId` and are aggregated per client instance, so an idle tab no longer hides an active one; the response also carries `manualAway`, `heartbeatInterval` and `typingTtl`; `PUT /presence/preference` persists a manual "appear away" preference. (#130, #131)
- Presence frames are pushed when a status changes, including when it lapses to `away` or `offline`, instead of on every heartbeat, and a snapshot of the visible peers is written when the stream opens. (#130)
- Presence and typing are delivered to each recipient, evaluated at emission: a space member receives the typing signals of its channels, the sender does not receive its own, and a membership change needs no reconnect. (#129)
- `PUT /rooms/:id/pins/:messageId` and `PUT /messages/:messageId/reactions/:emoji`
  answer `message.not_found` (`404`) for a redacted message.
- Read markers (`PUT` / `GET /rooms/:id/receipt(s)`) are available to effective
  members, including members inherited from an ancestor space, not only to explicit
  members.
- **Breaking.** `Message.mentions` and `message_created.content.mentions` are
  now mention targets `{ type, target, token }` instead of user ids, and
  `POST /rooms/:id/messages` takes target inputs (`{ type: "user", userId }`,
  `{ type: "all" }`, ...) instead of user ids. A mentioned user must now be an
  effective member of the room (ancestor space members included), not only an
  explicit member.

- Deleting a message also rewrites the account feed rows that mirrored the
  original `message_created`, so `GET /events` no longer replays the deleted
  body.
- `GET /events` without `Last-Event-ID` or `?lastEventId=` starts at the
  current head of the account's feed instead of replaying the retained feed.
  Behaviour change for clients that relied on a full replay: they must read
  `GET /sync` (or `GET /rooms/:id/messages`) for history.
- Room events are fanned out to the effective members of the room, ancestor
  spaces included, instead of the explicit members only.
- **Behaviour change.** A member can have a history floor: message reads, pins and
  `GET /sync` hide what precedes it, and a message below it answers
  `message.not_found` (`404`). It is set when a `dm` member deletes the conversation
  (`POST /rooms/:id/leave` now raises the floor and the `dm` reappears with the next
  message) and when a member is added to a group without its history.
- `POST /dms` and `POST /group-dms` answer `room.user_not_found` (`422`) for a user that
  does not exist or is not active, and `POST /dms` reopens a conversation the caller
  deleted.
- Leaving a `group_dm` removes the leaver's per-user overrides, and the group is deleted
  when no admin remains.
- A deleted room answers `room.not_found` (`404`) to every caller, including its former
  members.
- `PUT /me/avatar` now counts against the account's storage quota and can answer
  `upload.quota_exceeded` (`403`). (#138)

### Fixed

- A wrong password on `POST /me/email` and `DELETE /me` is documented as `401`
  `auth.invalid_credentials`, as the server has always answered (was `403`).
