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
- [Messages and interactions](messages-and-interactions.md),
  [Presence and typing](presence-and-typing.md) and
  [Synchronisation](synchronisation.md) (issue #38): restricted-Markdown
  grammar, structured mentions, message/pin/reaction/receipt endpoints and
  event payloads, presence/typing semantics, `GET /sync` and `GET /events`
  with the per-account `feedSeq`. Written ahead of the server implementation
  (issues #7-#11) from the settled technical design; reconciled against real
  behaviour once each ships.
