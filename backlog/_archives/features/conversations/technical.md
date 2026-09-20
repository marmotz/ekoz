# Conversations — technical design

Technical design for spaces, rooms, roles/permissions, messages, presence,
retention, the per-room event log and local moderation. Builds on
[server core](../server-core/technical.md) and
[identity and profiles](../../../features/identity-and-profiles/technical.md). The `server`
repository is greenfield, so this document defines the initial module.

Related: [conversation data model](../../../../docs/technical/conversation-data-model.md),
[event-log-and-ordering](../../../../docs/technical/event-log-and-ordering.md),
[realtime-transport](../../../../docs/technical/realtime-transport.md),
[retention-and-tombstones](../../../../docs/technical/retention-and-tombstones.md),
[api-conventions](../../../../docs/technical/api-conventions.md),
[permission-model](../../../../docs/technical/permission-model.md).

## 1. Scope

First increment:

- hierarchy of `space` / `channel` / `dm` / `group_dm` rooms (single `room`
  concept), closure table, configurable soft depth limit;
- capability-based ACL ([permission model](../../../../docs/technical/permission-model.md)):
  roles, default capability matrix, per-node and per-user overrides, one resolver;
- membership: join/leave public rooms, invitations, invite-only join requests,
  kick, ban/unban;
- public directory of public rooms (list + search);
- messages: send (restricted Markdown), replies, mentions (structured),
  edit/delete with visible flags and tombstones, pinned messages;
- reactions;
- read markers ("read up to `seq`") visible to participants;
- presence (online / away / offline) and typing indicators;
- retention: server default, space/room overrides, expiry job, hiding (terminal)
  or deletion (tombstone);
- the per-room event log `room_event` with a monotonic `seq`;
- real-time delivery: `GET /events` (SSE, per-account fan-in) + `GET /sync`
  (per-room catch-up), consuming the ticket from identity-and-profiles;
- local moderation actions, all audited.

Deferred: dedicated threads, federation, extension content types, notifications
delivery (this feature only *emits* notifiable events).

## 2. Module layout

```
src/modules/conversations/
  conversations.module.ts
  rooms/            # room CRUD, hierarchy, closure, directory
  membership/       # join/leave/invite/kick/ban/join-requests
  permissions/      # capability set, resolver, overrides, PermissionService
  messages/         # send/edit/delete, markdown, mentions, replies, pins
  reactions/
  receipts/         # read markers
  presence/         # presence + typing (ephemeral state + heartbeats)
  retention/        # policies, resolver, expiry worker
  events/           # room_event append, seq allocation, event types
  streaming/        # GET /events (SSE), GET /sync, account feed
  moderation/       # moderation actions surface (thin, delegates to the above)
```

## 3. Configuration parameters added

| key | kind | default | notes |
|-----|------|---------|-------|
| `rooms.max_depth` | runtime | `4` | soft nesting limit (spaces) |
| `rooms.directory_page_size` | runtime | `25` | directory pagination |
| `messages.body_max_length` | runtime | `16000` | characters |
| `messages.edit_window` | runtime | `null` | if set, authors can only self-edit within this delay |
| `retention.default` | runtime | `{ mode: "keep" }` | server default retention rule |
| `presence.heartbeat_interval` | runtime | `45s` | expected client heartbeat |
| `presence.away_after` | runtime | `5m` | no heartbeat → away |
| `presence.offline_after` | runtime | `15m` | no heartbeat → offline |
| `typing.ttl` | runtime | `6s` | a typing signal auto-expires after this |
| `sync.max_page` | runtime | `200` | max events returned per `/sync` call |

Retention rule shape: `{ mode: "keep" }` | `{ mode: "hide", after: "<duration>" }`
| `{ mode: "delete", after: "<duration>" }`.

## 4. Data model (Prisma slice)

```prisma
enum RoomType { space channel dm group_dm }
enum RoomVisibility { public private invite }
enum RoomRole { space_admin room_admin moderator member reader }
enum OverrideEffect { allow deny }
enum RoomEventType {
  message_created message_edited message_redacted message_hidden
  reaction_added reaction_removed
  member_joined member_left member_kicked member_banned member_unbanned
  role_changed permission_override_changed
  room_created room_updated room_moved room_deleted
  pin_added pin_removed
  retention_changed receipt_updated
}

model Room {
  id             String         @id @default(ulid())
  type           RoomType
  parentId       String?
  visibility     RoomVisibility @default(private)
  slug           String?                          // for channels, unique within parent
  name           String?
  topic          String?
  avatarBlobId   String?
  defaultRole    RoomRole       @default(member)  // role granted on join / to public readers
  readOnly       Boolean        @default(false)
  originServer   String                            // server.domain now; real value with federation
  lastSeq        BigInt         @default(0)         // seq allocator, see §10
  retention      Json           @default("{\"mode\":\"inherit\"}")
  dmKey          String?        @unique             // sorted "a:b" user id pair for dm dedup
  createdById    String?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?

  parent         Room?          @relation("room_children", fields: [parentId], references: [id])
  children       Room[]         @relation("room_children")
  @@index([parentId])
  @@index([type, visibility])
  @@map("room")
}

model RoomClosure {
  ancestorId   String
  descendantId String
  depth        Int
  @@id([ancestorId, descendantId])
  @@index([descendantId])
  @@map("room_closure")
}

model Membership {
  roomId    String
  userId    String
  role      RoomRole
  joinedAt  DateTime @default(now())
  invitedById String?
  @@id([roomId, userId])
  @@index([userId])
  @@map("membership")
}

model RoleDefaultCapability {
  role       RoomRole
  capability String
  effect     OverrideEffect
  @@id([role, capability])
  @@map("role_default_capability")
}

model RoomPermissionOverride {
  id         String         @id @default(ulid())
  nodeId     String                              // a Room id (space or channel)
  role       RoomRole
  capability String
  effect     OverrideEffect
  @@unique([nodeId, role, capability])
  @@index([nodeId])
  @@map("room_permission_override")
}

model RoomMemberPermission {
  id         String         @id @default(ulid())
  nodeId     String
  userId     String
  capability String
  effect     OverrideEffect
  @@unique([nodeId, userId, capability])
  @@index([nodeId])
  @@map("room_member_permission")
}

model RoomInvitation {
  id         String    @id @default(ulid())
  roomId     String
  userId     String                              // invited user
  invitedById String
  role       RoomRole  @default(member)
  createdAt  DateTime  @default(now())
  expiresAt  DateTime?
  acceptedAt DateTime?
  declinedAt DateTime?
  @@unique([roomId, userId])
  @@map("room_invitation")
}

model RoomJoinRequest {
  id         String    @id @default(ulid())
  roomId     String
  userId     String
  createdAt  DateTime  @default(now())
  resolvedAt DateTime?
  resolvedById String?
  approved   Boolean?
  @@unique([roomId, userId])
  @@map("room_join_request")
}

model RoomBan {
  roomId     String
  userId     String
  reason     String?
  bannedById String
  bannedAt   DateTime @default(now())
  @@id([roomId, userId])
  @@map("room_ban")
}

model Message {
  id          String    @id @default(ulid())
  roomId      String
  seq         BigInt                              // = the creating room_event seq
  authorId    String?                             // null after author hard-deletion is irrelevant; see identity forward contract
  body        String                              // restricted Markdown source
  replyToId   String?
  editedAt    DateTime?
  redactedAt  DateTime?                           // deletion (tombstone)
  redactedById String?
  hiddenAt    DateTime?                           // retention "hide" (terminal)
  createdAt   DateTime  @default(now())
  @@unique([roomId, seq])
  @@index([roomId, createdAt])
  @@index([replyToId])
  @@map("message")
}

model MessageMention {
  messageId String
  userId    String
  @@id([messageId, userId])
  @@index([userId])
  @@map("message_mention")
}

model MessagePin {
  roomId    String
  messageId String
  pinnedById String
  pinnedAt  DateTime @default(now())
  @@id([roomId, messageId])
  @@map("message_pin")
}

model Reaction {
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())
  @@id([messageId, userId, emoji])
  @@index([messageId])
  @@map("reaction")
}

model ReadMarker {
  roomId    String
  userId    String
  seq       BigInt
  updatedAt DateTime @updatedAt
  @@id([roomId, userId])
  @@map("read_marker")
}

model RoomEvent {
  roomId       String
  seq          BigInt
  type         RoomEventType
  senderId     String?
  content      Json
  originServer String                              // server.domain now; the room's home server once federated (§10)
  createdAt    DateTime @default(now())
  @@id([roomId, seq])
  @@index([roomId, createdAt])
  @@map("room_event")
}

model AccountFeedEvent {
  userId    String
  feedSeq   BigInt
  roomId    String
  roomSeq   BigInt
  kind      String                               // "room_event" | "account" (invites, presence, ...)
  payload   Json
  createdAt DateTime @default(now())
  @@id([userId, feedSeq])
  @@index([userId, createdAt])
  @@map("account_feed_event")
}
```

Presence and typing are **not** persisted as rows (see §15); they live in an
in-process store with a Redis upgrade path.

## 5. Hierarchy and closure

- `Room.parentId` is the tree edge; `room_closure` holds every
  `(ancestor, descendant, depth)` pair including the self pair `depth = 0`.
- Insert: copy the parent's ancestor rows with `depth + 1`, plus the self row.
- Move (`room_moved`): delete the subtree's closure rows that cross the old
  parent boundary, reinsert under the new parent; forbidden if it would create a
  cycle (new parent is a descendant) or exceed `rooms.max_depth`.
- Delete: soft (`deletedAt`) with a subtree check; a `room_deleted` event per
  affected room; content is purged by a background job under the retention rules.
- `dm` / `group_dm` have `parentId = null` and never appear in the closure beyond
  their self row.

## 6. Roles, capabilities, resolver

### Capabilities (closed set, protocol-versioned)

`room.read`, `room.post`, `room.edit_own`, `room.delete_own`, `room.edit_any`,
`room.delete_any`, `room.react`, `room.pin`, `room.invite`, `room.kick`,
`room.ban`, `room.manage_members`, `room.manage_roles`,
`room.manage_permissions`, `room.manage_retention`, `space.create_child`,
`space.manage`, `directory.publish`.

### Default matrix (`role_default_capability`, seeded)

| capability | space_admin | room_admin | moderator | member | reader |
|---|---|---|---|---|---|
| room.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| room.post | ✓ | ✓ | ✓ | ✓ | — |
| room.edit_own / delete_own | ✓ | ✓ | ✓ | ✓ | — |
| room.react | ✓ | ✓ | ✓ | ✓ | — |
| room.edit_any | ✓ | ✓ | — | — | — |
| room.delete_any / kick / ban / unban | ✓ | ✓ | ✓ | — | — |
| room.invite | ✓ | ✓ | ✓ | ✓* | — |
| room.pin | ✓ | ✓ | ✓ | — | — |
| room.manage_members | ✓ | ✓ | ✓ | — | — |
| room.manage_roles / manage_permissions / manage_retention | ✓ | ✓ | — | — | — |
| space.create_child / space.manage | ✓ | — | — | — | — |
| directory.publish | ✓ | ✓ | — | — | — |

`member.invite` is on by default only for `dm`/`group_dm` and public channels;
per-room overrides tune the rest. The server `owner` bypasses the matrix
entirely.

### Resolver

`PermissionService.can(userId, roomId, capability)` per
[permission model](../../../../docs/technical/permission-model.md):

1. server owner → allow.
2. effective role: `membership.role` on the room, else the role from the nearest
   ancestor space membership (via `room_closure` ordered by `depth`), else the
   room's `defaultRole` if the user may join (public, or a matching
   `room_invitation`), else no access → deny.
3. seed from `role_default_capability`.
4. fetch the ancestor chain root→room from `room_closure`; apply
   `room_permission_override` (by role) then `room_member_permission` (by user)
   in order; closest node wins, per-user beats per-role at equal depth.
5. no entry → seeded default; absent → deny.

Effective decisions are cached per `(roomId, userId)` and invalidated on any
membership, role, override, ban or `room_moved` change touching that room's
subtree. `GET /rooms/:id/my-permissions` returns the resolved capability set for
client UI gating.

## 7. Room types

| behaviour | space | channel | dm | group_dm |
|---|---|---|---|---|
| holds messages | no | yes | yes | yes |
| in hierarchy | yes | yes | no | no |
| in directory | no | if `public` | no | no |
| create | `space.create_child` on parent | `space.create_child` on parent | `POST /dms` | `POST /group-dms` |
| membership | inherited + explicit | inherited + explicit + public join | fixed pair | creator + added users |
| roles | full | full | both `member`, no admin | all `member` + a light `room_admin` for the creator (manage members only) |
| name/topic/avatar | yes | yes | derived from participants | optional |
| leave | yes | yes (if public) | hide/archive (per-user `Membership` flag `hiddenAt`) | leave |

`dm` dedup: `POST /dms { userId }` computes `dmKey = sorted(callerId, userId)`
and upserts; returns the existing room if any.

## 8. Directory

- `GET /directory?query=&cursor=` — public `channel` rooms only, keyset
  pagination, `query` runs a PostgreSQL FTS (`to_tsvector(name || ' ' || topic)`,
  GIN index) plus a trigram fallback for short prefixes.
- Publishing/unpublishing a room to the directory requires `directory.publish`
  and simply flips `visibility` between `public` and `private`
  (`room_updated` event).

## 9. Membership lifecycle

- **Join a public channel**: `POST /rooms/:id/join` → creates a `Membership`
  with `role = room.defaultRole`, emits `member_joined`. Blocked if a `RoomBan`
  exists.
- **Invite**: `POST /rooms/:id/invitations { userId, role? }` (needs
  `room.invite`) → `RoomInvitation`; the invitee sees it on their account feed;
  `POST /invitations/:id/accept|decline`.
- **Invite-only join request**: `POST /rooms/:id/join-request` → `RoomJoinRequest`;
  a member with `room.manage_members` approves/rejects
  (`POST /rooms/:id/join-requests/:id/approve|reject`).
- **Leave**: `POST /rooms/:id/leave` → removes `Membership`, `member_left`.
- **Kick**: `DELETE /rooms/:id/members/:userId` (needs `room.kick`) →
  `member_kicked`. **Ban**: `POST /rooms/:id/bans { userId, reason? }` (needs
  `room.ban`) → removes membership + `RoomBan` + `member_banned`. Unban removes
  the row + `member_unbanned`.
- Role change: `PATCH /rooms/:id/members/:userId { role }` (needs
  `room.manage_roles`), `role_changed` event. Cannot set a role above the
  caller's own effective authority.

## 10. Event log and `seq` allocation

- Every state change appends a `room_event`. Allocation, inside the same
  transaction as the state write:
  `UPDATE room SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq`.
  This serialises concurrent writers **per room** (row lock), which is
  acceptable and gives a gap-free monotonic `seq`.
- `Message.seq` equals the `seq` of its `message_created` event; later events
  about the same message (`message_edited`, `message_redacted`, `message_hidden`,
  reactions, pins, receipts) get their own higher `seq`.
- `room_event.content` is a typed JSON payload per `RoomEventType` (documented in
  the [protocol](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/README.md) event section).
- Retention "delete" rewrites the original `message_created` event into a
  tombstone (`type = message_redacted`, `content = { reason: "retention" }`,
  `senderId` kept) — no new `seq`, no gap
  ([retention and tombstones](../../../../docs/technical/retention-and-tombstones.md)).
- `originServer` on the room and on events is populated with `server.domain` now;
  it becomes meaningful with federation.

## 11. Messages

- `POST /rooms/:id/messages { body, replyToId?, mentions? }` — needs `room.post`
  and `room.readOnly = false` (or `room.edit_any`).
- `body`: **restricted Markdown** source, ≤ `messages.body_max_length`. Allowed
  constructs: emphasis, strong, strikethrough, inline code, fenced code,
  blockquote, ordered/unordered lists, links (`http(s)` + `mailto` only),
  hard/soft breaks. Disallowed: raw HTML, images, headings, tables (first
  increment), autolinked bare URLs beyond a safe linkifier. The server validates
  the source parses to only-allowed nodes (a `remark` pipeline with an allowlist)
  and stores the source; clients render with the same allowlist.
- **Mentions** are structured: the client sends `mentions: [userId]`; the server
  verifies each mentioned user is a room member (or resolvable), stores
  `message_mention` rows, and includes them in the event. The rendered `@name`
  in the body is cosmetic; the structured list is authoritative (drives
  notifications, survives name changes).
- **Replies**: `replyToId` must reference a message in the same room; a
  redacted/hidden parent still anchors the reply (shown as "deleted message").
- Pins: `PUT /rooms/:id/pins/:messageId` / `DELETE …` (needs `room.pin`),
  `pin_added` / `pin_removed`; `GET /rooms/:id/pins`.

## 12. Edit, delete, tombstones

- **Edit** (`PATCH /rooms/:id/messages/:messageId { body }`): needs
  `room.edit_own` (author, within `messages.edit_window` if set) or
  `room.edit_any`. Sets `editedAt`, updates `body`, emits `message_edited` with
  `{ editedAt }` — **never** the previous body. Prior versions are not retained
  (the requirement is only to *flag* the edit).
- **Delete** (`DELETE /rooms/:id/messages/:messageId`): needs `room.delete_own`
  or `room.delete_any`. Sets `redactedAt` / `redactedById`, clears `body`,
  cascades: remove `reaction`, `message_mention`, `message_pin` rows; the
  `message_created` event becomes a tombstone. Emits `message_redacted`.
- **Retention hide** (§13): sets `hiddenAt`, keeps `body` in the DB, emits
  `message_hidden`. Terminal — no un-hide endpoint; the content stays only for
  out-of-band / audit access.
- Attachments (content-and-sharing) will follow the same three paths.

## 13. Retention

- A room's effective rule = its own `retention` if not `inherit`, else the
  nearest ancestor space's, else `retention.default` (server config).
- Setting a room/space rule needs `room.manage_retention` on that node
  (`retention_changed` event).
- A periodic **retention worker** (interval configurable, default 15 min):
  - selects messages older than the rule's `after` in rooms where the effective
    rule is `hide` or `delete` and the message is not already hidden/redacted;
  - `hide` → set `hiddenAt`, emit `message_hidden`;
  - `delete` → tombstone the `message_created` event, clear `body`, dereference
    attachments, emit `message_redacted { reason: "retention" }`;
  - batched, idempotent, bounded per run.
- Changing a rule is not retroactive beyond what the worker naturally catches on
  its next pass (i.e. it *is* effectively retroactive for already-old messages) —
  documented behaviour.

## 14. Read markers

- One row per `(room, user)`: the highest contiguous `seq` the user has read.
- `PUT /rooms/:id/receipt { seq }` — monotonic (ignores a lower value), emits
  `receipt_updated { userId, seq }` to the room.
- `GET /rooms/:id/receipts` returns every member's marker (visible to
  participants, per the spec).
- Unread count for a room = `room.lastSeq - marker.seq` (approx; message-only
  count derived client-side or via a cached counter later).

## 15. Presence and typing

- **Transport**: heartbeats over REST (`POST /presence/heartbeat`), fan-out over
  the SSE stream ([real-time transport](../../../../docs/technical/realtime-transport.md)).
- **State**: in-process `Map<userId, { lastBeat, status }>` (Redis hash on
  multi-instance). Derived status: `online` if `lastBeat` within
  `presence.away_after`, `away` until `presence.offline_after`, else `offline`.
  A client may also declare `away` explicitly.
- **Visibility**: a user receives presence updates for users they share at least
  one room with, plus their DM partners. Computed from `membership` (+ a small
  per-connection subscription set).
- **Typing**: `POST /rooms/:id/typing` → broadcasts a `typing` signal to room
  members with a `typing.ttl` expiry; never persisted, never in the event log.

## 16. Sync and real-time delivery

- **Per-room cursor**: `seq`. `GET /sync?room=<id>&since=<seq>&limit=` returns
  ordered `room_event`s `(since, …]`, up to `sync.max_page`, with the room's
  current `lastSeq`. Used for initial load and reconnection reconciliation.
- **Account feed**: `AccountFeedEvent` is a per-user fan-in projection with its
  own `feedSeq`. When a `room_event` is appended, a fan-out step inserts a feed
  row for each member with `room.read`; account-scoped events (room invitations,
  presence, join-request outcomes) are inserted directly.
- **SSE**: `GET /events?ticket=<t>` (ticket from
  [identity-and-profiles §12](../../../features/identity-and-profiles/technical.md)). Validates
  the ticket, binds to the session, streams `AccountFeedEvent`s as they are
  produced. `Last-Event-ID` = the last `feedSeq`; on reconnect the server may
  replay recent feed rows, but the SDK's contract is to reconcile per stale room
  via `/sync` and treat the stream as best-effort-live.
- The feed table is pruned (rows older than N days or below every session's
  acked `feedSeq`); `/sync` remains the source of truth for anything older.
- **Fan-out cost**: proportional to online members of an active room; the append
  transaction only writes the `room_event`, the feed fan-out is an async worker
  reading the log, so message latency for the writer is unaffected.

## 17. Local moderation

The `moderation/` surface is a thin façade over capabilities already defined:
delete any message (`room.delete_any`), kick (`room.kick`), ban/unban
(`room.ban`). Every moderation action writes an `audit_log` entry
(`action = "moderation.<verb>"`, `target` = room/message/user) in addition to the
`room_event`. Server-wide moderation (global bans, cross-room deletion) is
[server administration](../server-administration/overview.md).

## 18. Endpoint summary (non-exhaustive)

| Method & path | Capability | Purpose |
|---|---|---|
| `POST /spaces`, `POST /rooms` | `space.create_child` on parent | create node |
| `PATCH /rooms/:id`, `POST /rooms/:id/move`, `DELETE /rooms/:id` | `space.manage` | structure |
| `GET /rooms/:id`, `GET /rooms/:id/children` | `room.read` | read |
| `GET /rooms/:id/my-permissions` | member | client UI gating |
| `GET /directory` | authenticated | discover public rooms |
| `POST /rooms/:id/join` / `leave` / `join-request` | — / — / — | membership |
| `POST /rooms/:id/invitations`, `POST /invitations/:id/accept\|decline` | `room.invite` | invite |
| `DELETE /rooms/:id/members/:userId`, `POST /rooms/:id/bans`, `PATCH /rooms/:id/members/:userId` | kick / ban / manage_roles | moderation |
| `POST /rooms/:id/messages`, `PATCH …/:mid`, `DELETE …/:mid` | post / edit_* / delete_* | messages |
| `PUT /rooms/:id/pins/:mid`, `GET /rooms/:id/pins` | `room.pin` / read | pins |
| `PUT /messages/:mid/reactions/:emoji`, `DELETE …` | `room.react` | reactions |
| `PUT /rooms/:id/receipt` | member | read marker |
| `PUT /rooms/:id/retention`, `GET …` | `room.manage_retention` / read | retention |
| `POST /rooms/:id/typing`, `POST /presence/heartbeat` | member | presence/typing |
| `GET /sync`, `GET /events` | member / session | delivery |
| `PUT /rooms/:id/permissions`, `PUT /rooms/:id/members/:userId/permissions` | `room.manage_permissions` | ACL overrides |

## 19. Alternatives considered

| Point | Retained | Rejected | Why |
|---|---|---|---|
| Permission model | granular capability ACL from increment 1 | fixed role matrix + a few room flags | user choice; [permission model](../../../../docs/technical/permission-model.md) |
| Hierarchy storage | closure table | recursive CTE per check, materialized path | ancestor chain + subtree in one indexed query; permission resolution is hot |
| `seq` allocation | `UPDATE room … RETURNING last_seq` in-txn | per-room Postgres sequence, advisory lock, app-side counter | gap-free, simple, per-room serialisation is acceptable |
| Message body | restricted Markdown source, validated allowlist | plain text; full Markdown + sanitised HTML | user choice; server-validated allowlist keeps rendering safe and portable |
| Mentions | structured `userId` list, body `@name` cosmetic | parse mentions from the body at read time | survives name changes, drives notifications deterministically |
| Read receipts | "read up to `seq`" per (room,user) | per-message receipt rows | O(1) storage, standard, enough for the spec's "visible to participants" |
| Presence/typing | ephemeral in-process (Redis upgrade) | rows in the DB | high churn, no durability value, would bloat the event log |
| Real-time stream | per-account feed projection + SSE, `/sync` as truth | encode the full per-room `seq` vector in `Last-Event-ID`; stream straight from `room_event` | one cursor for the socket, bounded reconnect logic, DB fan-out isolated from the write path |
| Retention "hide" | terminal | reversible by moderation | user choice |
| Directory search | PostgreSQL FTS + trigram | external search engine | one data dependency ([server stack](../../../../docs/technical/server-stack.md)) |

## 20. Consequences

- Largest module of the first increment; creates the `room_event` log that
  federation later replicates and that server-administration reads for activity.
- `PermissionService` becomes a dependency of every write endpoint in this module
  and of content-and-sharing.
- The account feed fan-out worker is the first background worker beyond
  server-core's blob GC and email queue; it shares the "in-process now, Redis on
  multi-instance" pattern with the presence store and the `sid` denylist.
- Notifications will subscribe to `room_event` / `message_mention` /
  `member_*` events; this feature must emit them with stable shapes.
- Forward contract honoured from identity-and-profiles: deleted users resolve to
  "Deleted account", authorship and mentions key on `User.id`.
- Protocol: this feature fills the "Spaces, rooms, roles", "Messages and
  interactions", "Presence and typing" and part of the "Synchronisation"
  sections; `docs/protocol/CHANGELOG.md` updated accordingly.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`. Roughly in dependency order.

1. [#1 — room model and hierarchy](../../tasks/1-conv-room-model-and-hierarchy.md)
2. [#2 — per-room event log and seq allocation](../../tasks/2-conv-event-log-and-seq.md)
3. [#3 — capability ACL and resolver](../../tasks/3-conv-permission-model.md)
4. [#4 — membership lifecycle](../../tasks/4-conv-membership.md)
5. [#5 — direct and group conversations](../../tasks/5-conv-dm-and-group-dm.md)
6. [#6 — public room directory](../../tasks/6-conv-directory.md)
7. [#7 — messages, Markdown, mentions, replies, pins](../../tasks/7-conv-messages.md)
8. [#8 — message edit, delete, tombstones](../../tasks/8-conv-message-edit-delete-tombstones.md)
9. [#9 — reactions and read markers](../../tasks/9-conv-reactions-and-read-markers.md)
10. [#10 — presence and typing](../../tasks/10-conv-presence-and-typing.md)
11. [#11 — sync endpoint, account feed, SSE stream](../../tasks/11-conv-streaming-sync-and-feed.md)
12. [#12 — retention policies and worker](../../tasks/12-conv-retention.md)
13. [#13 — local moderation surface](../../tasks/13-conv-local-moderation.md)
14. [#38 — protocol: conversations sections](https://github.com/marmotz/ekoz/blob/develop/backlog/tasks/1-conv-protocol-sections.md)
