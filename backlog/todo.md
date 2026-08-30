# Tasks to do

The first increment is **core + messaging** (see the
[specification](https://github.com/ekoz-chat/spec/blob/main/docs/functional/specification.md) and the
[architecture](https://github.com/ekoz-chat/spec/blob/main/docs/technical/architecture.md)): identity, basic administration, spaces/rooms/permissions, messages,
presence, retention, local moderation, demonstration client.

First-increment features (`server-core`, `identity-and-profiles`, `conversations`)
have a technical design and tasks below. The later features
(`content-and-sharing`, `notifications`, `server-administration`, `federation`,
`extensibility`) still have only an `overview.md` and will be scoped when their
increment starts.

Implement in dependency order; each task file has a `## Dependencies` section and
each issue body carries `Depends on #N` lines.

## Server core

[Technical design](features/server-core/technical.md)

| Done | Issue                                                | Task                                                                        | Description                                                        |
|------|------------------------------------------------------|-----------------------------------------------------------------------------|--------------------------------------------------------------------|
| ☐   | [#1](https://github.com/ekoz-chat/server/issues/1)   | [1-server-skeleton](tasks/1-server-skeleton.md)                             | NestJS 12 ESM app, Bun, ESLint, Vitest, Docker, CI                 |
| ☐   | [#2](https://github.com/ekoz-chat/server/issues/2)   | [2-prisma-setup](tasks/2-prisma-setup.md)                                   | Prisma 8-rc, adapter-pg, PrismaService, migrations, testcontainers |
| ☐   | [#3](https://github.com/ekoz-chat/server/issues/3)   | [3-http-conventions](tasks/3-http-conventions.md)                           | problem+json, Zod validation, request context, pino                |
| ☐   | [#4](https://github.com/ekoz-chat/server/issues/4)   | [4-config-system](tasks/4-config-system.md)                                 | TOML loader, registry, settings table, layered resolution          |
| ☐   | [#5](https://github.com/ekoz-chat/server/issues/5)   | [5-crypto-and-signing-keys](tasks/5-crypto-and-signing-keys.md)             | secret box, Ed25519 keys, SigningService, rotation                 |
| ☐   | [#6](https://github.com/ekoz-chat/server/issues/6)   | [6-server-identity-and-discovery](tasks/6-server-identity-and-discovery.md) | domain validation, `/.well-known/ekoz`                             |
| ☐   | [#7](https://github.com/ekoz-chat/server/issues/7)   | [7-audit-log](tasks/7-audit-log.md)                                         | append-only audit_log + AuditService                               |
| ☐   | [#8](https://github.com/ekoz-chat/server/issues/8)   | [8-bootstrap-initialization](tasks/8-bootstrap-initialization.md)           | setup state machine, token, SetupGuard                             |
| ☐   | [#9](https://github.com/ekoz-chat/server/issues/9)   | [9-object-storage](tasks/9-object-storage.md)                               | StorageDriver, local driver, blob dedup, GC, `/blobs/:id`          |
| ☐   | [#10](https://github.com/ekoz-chat/server/issues/10) | [10-outbound-email](tasks/10-outbound-email.md)                             | Mailer, SMTP driver, templates, retry queue                        |
| ☐   | [#11](https://github.com/ekoz-chat/server/issues/11) | [11-health-endpoints](tasks/11-health-endpoints.md)                         | `/healthz`, `/readyz`                                              |

## Identity and profiles

[Technical design](features/identity-and-profiles/technical.md)

| Done | Issue                                                | Task                                                                                          | Description                                                          |
|------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| ☐   | [#12](https://github.com/ekoz-chat/server/issues/12) | [12-identity-user-model-and-identifier](tasks/12-identity-user-model-and-identifier.md)       | User/UserProfile/ReservedUsername, identifier rules, Argon2id        |
| ☐   | [#13](https://github.com/ekoz-chat/server/issues/13) | [13-identity-auth-tokens-and-guards](tasks/13-identity-auth-tokens-and-guards.md)             | JWT access + rotating refresh, reuse detection, AuthGuard/OwnerGuard |
| ☐   | [#14](https://github.com/ekoz-chat/server/issues/14) | [14-identity-session-management](tasks/14-identity-session-management.md)                     | list/rename/revoke sessions                                          |
| ☐   | [#15](https://github.com/ekoz-chat/server/issues/15) | [15-identity-registration-and-invitations](tasks/15-identity-registration-and-invitations.md) | 3 registration modes, invitations (owners)                           |
| ☐   | [#16](https://github.com/ekoz-chat/server/issues/16) | [16-identity-email-verification](tasks/16-identity-email-verification.md)                     | verification + resend + email change                                 |
| ☐   | [#17](https://github.com/ekoz-chat/server/issues/17) | [17-identity-password-reset](tasks/17-identity-password-reset.md)                             | request/confirm, revoke all sessions                                 |
| ☐   | [#18](https://github.com/ekoz-chat/server/issues/18) | [18-identity-first-owner-setup-endpoint](tasks/18-identity-first-owner-setup-endpoint.md)     | `POST /setup/owner`, wires server-core bootstrap                     |
| ☐   | [#19](https://github.com/ekoz-chat/server/issues/19) | [19-identity-profile-and-avatar](tasks/19-identity-profile-and-avatar.md)                     | profile read/update, avatar via BlobService                          |
| ☐   | [#20](https://github.com/ekoz-chat/server/issues/20) | [20-identity-identifier-change](tasks/20-identity-identifier-change.md)                       | immutable/available/approval policies                                |
| ☐   | [#21](https://github.com/ekoz-chat/server/issues/21) | [21-identity-account-lifecycle](tasks/21-identity-account-lifecycle.md)                       | suspension, deletion + anonymisation, owners                         |
| ☐   | [#22](https://github.com/ekoz-chat/server/issues/22) | [22-identity-sensitive-endpoint-throttle](tasks/22-identity-sensitive-endpoint-throttle.md)   | narrow throttle on credential endpoints                              |
| ☐   | [#23](https://github.com/ekoz-chat/server/issues/23) | [23-identity-sse-stream-ticket](tasks/23-identity-sse-stream-ticket.md)                       | `POST /stream/ticket` + ticket store                                 |

## Conversations

[Technical design](features/conversations/technical.md)

| Done | Issue                                                | Task                                                                                      | Description                                                   |
|------|------------------------------------------------------|-------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| ☐   | [#24](https://github.com/ekoz-chat/server/issues/24) | [24-conv-room-model-and-hierarchy](tasks/24-conv-room-model-and-hierarchy.md)             | Room/RoomClosure, spaces & channels, move/delete, depth guard |
| ☐   | [#25](https://github.com/ekoz-chat/server/issues/25) | [25-conv-event-log-and-seq](tasks/25-conv-event-log-and-seq.md)                           | RoomEvent, seq allocation, append service, typed payloads     |
| ☐   | [#26](https://github.com/ekoz-chat/server/issues/26) | [26-conv-permission-model](tasks/26-conv-permission-model.md)                             | capability ACL, default matrix, overrides, resolver + cache   |
| ☐   | [#27](https://github.com/ekoz-chat/server/issues/27) | [27-conv-membership](tasks/27-conv-membership.md)                                         | join/leave/invite/join-request/kick/ban/role change           |
| ☐   | [#28](https://github.com/ekoz-chat/server/issues/28) | [28-conv-dm-and-group-dm](tasks/28-conv-dm-and-group-dm.md)                               | `POST /dms` dedup, group DMs, hide/archive, flattened roles   |
| ☐   | [#29](https://github.com/ekoz-chat/server/issues/29) | [29-conv-directory](tasks/29-conv-directory.md)                                           | public room directory, FTS + trigram search                   |
| ☐   | [#30](https://github.com/ekoz-chat/server/issues/30) | [30-conv-messages](tasks/30-conv-messages.md)                                             | send, restricted Markdown, mentions, replies, pins            |
| ☐   | [#31](https://github.com/ekoz-chat/server/issues/31) | [31-conv-message-edit-delete-tombstones](tasks/31-conv-message-edit-delete-tombstones.md) | edit flag, delete cascade + tombstone                         |
| ☐   | [#32](https://github.com/ekoz-chat/server/issues/32) | [32-conv-reactions-and-read-markers](tasks/32-conv-reactions-and-read-markers.md)         | reactions, "read up to seq" markers                           |
| ☐   | [#33](https://github.com/ekoz-chat/server/issues/33) | [33-conv-presence-and-typing](tasks/33-conv-presence-and-typing.md)                       | presence heartbeat + status, typing signals                   |
| ☐   | [#34](https://github.com/ekoz-chat/server/issues/34) | [34-conv-streaming-sync-and-feed](tasks/34-conv-streaming-sync-and-feed.md)               | `/sync`, account feed fan-out, `GET /events` SSE              |
| ☐   | [#35](https://github.com/ekoz-chat/server/issues/35) | [35-conv-retention](tasks/35-conv-retention.md)                                           | rule resolver, retention worker (hide/delete)                 |
| ☐   | [#36](https://github.com/ekoz-chat/server/issues/36) | [36-conv-local-moderation](tasks/36-conv-local-moderation.md)                             | moderation façade + audit entries                             |
| ☐   | [spec#1](https://github.com/ekoz-chat/spec/issues/1) | [1-conv-protocol-sections](https://github.com/ekoz-chat/spec/blob/main/backlog/tasks/1-conv-protocol-sections.md)                             | write the conversations protocol sections                     |

## Content and sharing

[Feature in discussion](features/content-and-sharing/overview.md)

## Notifications

[Feature in discussion](features/notifications/overview.md)

## Server administration

[Feature in discussion](features/server-administration/overview.md)

## Federation

[Feature in discussion](features/federation/overview.md)

## Extensibility

[Feature in discussion](features/extensibility/overview.md)
