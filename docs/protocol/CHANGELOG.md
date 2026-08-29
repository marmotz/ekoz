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
  UUID v7 identifiers, UTC ISO-8601 timestamps, `X-Request-Id` correlation
  (see ADR 0017).
- Discovery document shape at `GET /.well-known/ekoz` (server, api, web,
  protocol_versions, signing_keys).
- Identity surface (draft): `name/server` identifier rules, auth token model
  (JWT access + rotating opaque refresh, reuse detection), session objects,
  SSE stream ticket.
- Conversations surface (draft): `room` object with `type`, capability list and
  permission resolution, `room_event` types and per-room `seq`,
  `GET /sync` and `GET /events` (per-account fan-in feed with its own cursor),
  restricted-Markdown message body, structured mentions, read markers,
  presence/typing signals.
