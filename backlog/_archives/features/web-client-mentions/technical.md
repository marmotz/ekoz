# Web client mentions: technical design

This page covers:
- the mentions UI of `apps/client-web`;
- the server changes in `apps/server` (structured mention targets and audience,
  room groups, unread mention counters, "My mentions", history around a message);
- the matching SDK bindings in `packages/sdk`.

Product decisions are in [overview.md](./overview.md). This page grounds them
in the code.

Related:
- [messages and interactions protocol](../../../../docs/protocol/messages-and-interactions.md);
- [rooms and permissions protocol](../../../../docs/protocol/rooms-and-permissions.md);
- [permission model](../../../../docs/technical/permission-model.md);
- [user identifier](../../../../docs/technical/user-identifier.md);
- [web client chat](../../../../docs/technical/web-client-chat.md);
- [web client composer editor](../../../../docs/technical/web-client-composer-editor.md)
  (TipTap 3, decided with this design);
- [OpenAPI description and SDK types](../../../../docs/technical/openapi-description-and-sdk-types.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | The mention check reads an **explicit** `Membership` on the room only. A space member reading a channel through inheritance cannot be mentioned (`422 message.mention_not_member`). | [messages.service.ts:61](../../../../apps/server/src/modules/conversations/messages/messages.service.ts) | Fixed here: the check uses effective membership, the same set as `GET /rooms/:id/members`. |
| F2 | `message_mention` is `(messageId, userId)`, and the wire field is `mentions: string[]` on `Message` and in `message_created`. Nothing ties a user id to a place in the body. | [contract.prisma:610](../../../../apps/server/src/core/prisma/contract.prisma), [message.view.ts:13](../../../../apps/server/src/modules/conversations/messages/message.view.ts), [room-event.types.ts:93](../../../../apps/server/src/modules/conversations/events/room-event.types.ts) | Replaced by targets that carry their body token, plus a separate audience table (S1). A breaking wire change, acceptable: the protocol is Draft and `@ekozhq/sdk` is `0.0.0`. |
| F3 | `PATCH /rooms/:id/messages/:messageId` takes `{ body }` only. `message_edited` carries `{ messageId, editedAt }`, and the client refetches the message (`GET`) on that event. | [messages.dto.ts:16](../../../../apps/server/src/modules/conversations/messages/messages.dto.ts), [timeline.ts:196](../../../../apps/client-web/src/features/chat/lib/timeline.ts) | `PATCH` gains `mentions?`. The refetch already brings the new mentions, so no event change is needed. |
| F4 | Effective members = explicit memberships of the room and its ancestor spaces. The role is the one of the nearest membership. Public-room readers without a membership are not members. | [membership.service.ts:139](../../../../apps/server/src/modules/conversations/membership/membership.service.ts), [feed-fanout.service.ts:48](../../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | `@all` and `@<role>` resolve against this same set, through one shared query (S2). |
| F5 | Read markers are explicit-membership only: `assertParticipant` rejects an inherited space member. | [receipts.service.ts:63](../../../../apps/server/src/modules/conversations/receipts/receipts.service.ts) | An inherited member has no marker, so their unread mentions never clear. Extending markers to effective members is owned by [`web-client-read-state`](../web-client-read-state/overview.md), a prerequisite (§6). |
| F6 | `GET /rooms` lists spaces and channels only (no `dm` / `group_dm`). | [rooms.service.ts:94](../../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | Unread mention counters get their own endpoint, covering every room type (S5), instead of a field on the rooms list. |
| F7 | `GET /rooms/:id/messages` only pages backwards (`before`). The timeline assumes a contiguous window ending at the newest message. | [messages.service.ts:215](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [timeline.ts:44](../../../../apps/client-web/src/features/chat/lib/timeline.ts) | `around` / `after` query params, and a detached timeline window (S6, C5). |
| F8 | `/sync` replays shared `room_event` rows. The SSE feed replays per-user `account_feed_event` copies of the same payload. | [sync.service.ts:44](../../../../apps/server/src/modules/conversations/streaming/sync.service.ts), [feed-fanout.service.ts:28](../../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | A per-viewer field cannot be added to a live event consistently. Live, "concerns me" is derived client-side; REST views carry the server's value (S3, C3). |
| F9 | The capability set is closed and grows additively. Role defaults are upserted at boot. | [capabilities.ts](../../../../apps/server/src/modules/conversations/permissions/capabilities.ts), [role-default-capabilities.ts](../../../../apps/server/src/modules/conversations/permissions/role-default-capabilities.ts), [role-default-capabilities.seeder.ts](../../../../apps/server/src/modules/conversations/permissions/role-default-capabilities.seeder.ts) | `room.manage_groups` is added with `space_admin` / `room_admin` defaults and seeded on the next boot, with no data migration. |
| F10 | The composer is a `<textarea>`. Message bodies render through `react-markdown` with an element allow-list. [`web-client-members`](../web-client-members/technical.md) moves the members query to `shared/members` (`useRoomMembers`, `useUserSummaries` for users who left, #123 to #125) and the profile card to `shared/profile` (#126). | [composer.tsx](../../../../apps/client-web/src/features/chat/components/composer.tsx), [markdown-allow-list.ts](../../../../apps/client-web/src/features/chat/lib/markdown-allow-list.ts), [members technical.md §6](../web-client-members/technical.md#6-client-architecture-apps-client-web) | TipTap composer (C1). A remark plugin turns tokens into chips (C2). Chips reuse `useRoomMembers`, `useUserSummaries` and `ProfileCardPopover`. |
| F11 | Client features never import one another (ESLint `boundaries` rule). Routes compose them, and the shell has sidebar-section and nav registries. | [eslint.config.js](../../../../apps/client-web/eslint.config.js), [$roomId.tsx](../../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx), [sidebar-section-registry.ts](../../../../apps/client-web/src/shared/layout/sidebar-section-registry.ts) | Code used by several features goes to `shared/`: message rendering and chips in `shared/messages`, groups queries in `shared/groups`, unread mention counters in `shared/mentions`. Composer and timeline stay in `features/chat`; "My mentions" is a new `features/mentions`; the per-room badge and the groups settings live in `features/rooms`. |

## 2. Model

A message has **targets** and an **audience**.

- A **target** is what the author wrote. It has a `type` (`user`, `all`, `role`
  or `group`), an id when the type needs one (`userId`, role name, `groupId`),
  and the **token**: the literal text standing for it in the body.
  - The server freezes the token when the target is created: `@name/server`
    for a user, `@all`, `@<role>`, `@<groupName>`.
  - The client locates a mention by its token, so a later rename or deletion
    never breaks the association.
- The **audience** is who the message concerns. It is resolved from the targets
  when a target is created, then frozen. One row per (target, user), carrying
  the `seq` of the event that created the target:
  - the message's own `seq` for targets present at send time;
  - the `message_edited` event's `seq` for targets added by an edit.

  "Concerns me" means at least one audience row for me. "Direct" means one of
  them comes from a `user` target. "Unread" means one of them has
  `seq > my read marker`. So a mention added by editing an old message
  counts as new, as decided.

Alternatives considered:
- **Markdown link with an `ekoz:` scheme in the body.** It gives an exact
  position match, but changes the grammar and makes the body opaque to other
  clients. Rejected by the user.
- **Additive fields with no token.** A renamed user's mention is no longer
  recognised in the body. Rejected.
- **Computing the audience at read time.** There is no membership history, so
  "effective members at send time" could not be answered. Rejected.

## 3. Server (`apps/server`, `conversations` module)

Follows the existing controller / service / `*.view.ts` split (Zod +
`createZodDto`, `@ApiProblemResponses`). Cross-module reads go through
`PrismaService` and `UserSummaryReader` (`lint:boundaries`).

### S1. Schema

In [contract.prisma](../../../../apps/server/src/core/prisma/contract.prisma):

- `MessageMention` is replaced by two tables (migration with a data backfill,
  see below).

  ```prisma
  /// What the author wrote (web-client-mentions §2). `target` is the userId,
  /// role name or groupId; "" for `all`. `token` is frozen at creation.
  model MessageMentionTarget {
    messageId String @map("message_id")
    type      String            // user | all | role | group
    target    String
    token     String
    position  Int               // order of first use, for a stable wire order
    @@id([messageId, type, target])
    @@map("message_mention_target")
  }

  /// Who a message concerns, frozen when its target was created.
  model MessageMentionRecipient {
    messageId String @map("message_id")
    type      String
    target    String
    userId    String @map("user_id")
    roomId    String @map("room_id")
    seq       BigInt            // seq of the event that created the target
    @@id([messageId, type, target, userId])
    @@index([userId, roomId, seq])
    @@index([messageId])
    @@map("message_mention_recipient")
  }
  ```

- Groups:

  ```prisma
  /// A named set of members defined on a room or space (web-client-mentions §3 S4).
  model RoomGroup {
    id          String                     @id @default(ulid())
    nodeId      String                     @map("node_id")
    name        String
    createdById String                     @map("created_by_id")
    createdAt   temporal.createdAtString() @map("created_at")
    @@unique([nodeId, name])
    @@index([nodeId])
    @@map("room_group")
  }

  model RoomGroupMember {
    groupId String                     @map("group_id")
    userId  String                     @map("user_id")
    addedAt temporal.createdAtString() @map("added_at")
    @@id([groupId, userId])
    @@index([userId])
    @@map("room_group_member")
  }
  ```

- `RoomEventType` gains `group_changed` (additive).
- **Backfill.** Every existing `message_mention` row becomes:
  - a `user` target with `token = "@" + identifier` resolved now, or
    `@deleted` when the account is gone (such tokens simply never match the
    body);
  - one recipient row with `seq = message.seq`.

  Then the old table is dropped. Dev data only in practice, but the migration
  stays correct.
- `redactMessage` deletes targets and recipients instead of `message_mention`
  ([messages.service.ts:193](../../../../apps/server/src/modules/conversations/messages/messages.service.ts)).

### S2. Mention resolution (`messages/mention-resolver.ts`)

A new `MentionResolver` service, used by send and edit.

- **Input.** An array (max 100) of:

  ```ts
  { type: 'user', userId } | { type: 'all' } | { type: 'role', role } | { type: 'group', groupId }
  ```

  Duplicates are collapsed.
- **Effective members.** One raw query returning `(userId, role)` for the
  room: explicit plus ancestor memberships, nearest role wins. It is the
  `listMembers` SQL without pagination, extracted into a shared
  `EffectiveMembersQuery` provider that `MembershipService.listMembers` and
  `FeedFanoutService` also reuse.
- **Validation:**
  - `user`: must be an effective member (fixes F1), else `422 message.mention_not_member`.
  - `all`, `role`, `group`: allowed in `channel` rooms only. In a `dm` /
    `group_dm`, `422 message.mention_invalid`.
  - `group`: the group must be defined on the room or one of its ancestors, else
    `422 message.mention_invalid`.
  - The role must be one of the five `RoomRole` values (Zod enum).
- **Token and audience:**
  - `user`: token `@` + current identifier; audience = that user.
  - `all`: token `@all`; audience = every effective member.
  - `role`: token `@<role>`; audience = effective members whose effective role
    equals it.
  - `group`: token `@<group.name>`; audience = group members ∩ effective members.
- **Author.** The author is never in their own audience (no self-mention noise).
  Their own `user` target is still stored and rendered.
- **Body.** The body is not checked for the tokens. A target whose token does
  not appear still concerns its audience; the client just has nothing to turn
  into a chip. The composer always writes the tokens (C1).

### S3. Send, edit, read

- **`POST /rooms/:id/messages`.** `mentions` takes the target inputs of S2.
  - Targets and recipients (`seq` = the message's) are written in the send
    transaction.
  - `message_created.content.mentions` and `Message.mentions` become:

    ```ts
    MentionTarget[] = Array<{ type, target: string | null, token }>
    ```

    `target` is `null` for `all`.
- **`PATCH /rooms/:id/messages/:messageId`.** Body `{ body, mentions? }`.
  - `mentions` absent: targets unchanged.
  - `mentions` present: the full new target list.
    - A kept target (same `type` + `target`) keeps its token and audience,
      with no re-evaluation, as decided.
    - Removed targets delete their recipient rows.
    - Added targets are resolved now, with recipients at the `seq` of the
      `message_edited` event appended in the same transaction. `eventLog.append`
      returns it before the rows are written.
  - The `message_edited` payload is unchanged (F3).
- **Per-viewer field.** `Message` gains `mentionsMe: 'direct' | 'collective' | null`
  in REST responses (list, get, around, "My mentions").
  - Computed with one recipient query per page, keyed by the caller.
  - The `message_created` event does not carry it (F8).
- **`MessageMentionNotMemberError`** keeps its code. New
  `MessageMentionInvalidError` (`message.mention_invalid`, 422).

### S4. Room groups (`groups/`, new sub-folder of `conversations`)

- **Capability.** `room.manage_groups` is appended to `CAPABILITIES`, and
  granted by default to `space_admin` and `room_admin` in
  `ROLE_DEFAULT_CAPABILITIES`.
- **Names:**
  - Must match `^[a-z0-9_.-]{1,32}$`.
  - Reserved names: `all` and the five role names (`422 group.name_reserved`).
  - Unique over the whole ancestor and descendant chain of the node, via
    `RoomClosure` in both directions (`409 group.name_taken`).
- **Endpoints**, all under a node `:id` (space or channel):

  | Method | Path | Needs | Effect |
  |--------|------|-------|--------|
  | `GET` | `/rooms/:id/groups` | `room.read` | Groups defined on `:id` and its ancestors: `{ items: [{ id, nodeId, name, memberCount, inherited, isMember }] }`. `isMember` is for the caller. |
  | `GET` | `/rooms/:id/groups/:groupId` | `room.read` | Group plus `members: UserSummary[]`. The group must be visible from `:id`. |
  | `POST` | `/rooms/:id/groups` | `room.manage_groups` | `{ name, memberIds? }` creates the group on `:id`. |
  | `PATCH` | `/rooms/:id/groups/:groupId` | `room.manage_groups` on the group's node | `{ name }` renames it. Existing message tokens keep the old name (§2). |
  | `DELETE` | `/rooms/:id/groups/:groupId` | same | Deletes the group and its members. Recipient rows stay, since the people were concerned. |
  | `PUT` / `DELETE` | `/rooms/:id/groups/:groupId/members/:userId` | same | Adds or removes a member. The user must be an effective member of the node (`422 group.member_not_member`). |

  `404 group.not_found` when the group is not on (or above) `:id`.
- **Event.** Every write appends `group_changed` on the group's node:

  ```ts
  { groupId, change: 'created' | 'renamed' | 'deleted' | 'member_added' | 'member_removed', name, userId? }
  ```

  The event only fans out to the node's own effective members. Descendant
  channels refetch groups by query staleness (C4); they do not need the event.
- **Leaving.** When a user leaves, is kicked or is banned from a node, their
  `RoomGroupMember` rows are deleted for groups on that node and its
  descendants, in the same transaction:
  - `leave` in [membership.service.ts:207](../../../../apps/server/src/modules/conversations/membership/membership.service.ts);
  - `kick` at [:545](../../../../apps/server/src/modules/conversations/membership/membership.service.ts);
  - `ban` at [:563](../../../../apps/server/src/modules/conversations/membership/membership.service.ts).

  Resolution intersects with effective members anyway (S2), so this is
  hygiene, not correctness.
- **Room move.** `moveRoom`
  ([rooms.service.ts:241](../../../../apps/server/src/modules/conversations/rooms/rooms.service.ts))
  refuses a move that would put two same-named groups on one chain:
  `409 group.name_taken`.
- **Permission cache.** No invalidation needed: groups do not change capabilities.

### S5. Unread counters and "My mentions" (`mentions/`, new sub-folder)

- **`GET /me/mentions/unread`** returns:

  ```ts
  { items: Array<{ roomId, direct: number, collective: number }> }
  ```

  - Counts distinct messages with a recipient row for the caller where
    `seq > coalesce(read_marker.seq, 0)`.
  - A message is counted as `direct` if any of its rows is direct, otherwise
    as `collective`.
  - Excludes redacted and hidden messages, and rooms the caller no longer has
    `room.read` on.
  - Uses the `(userId, roomId, seq)` index. Covers every room type (F6).
- **`GET /me/mentions?cursor=&limit=`** returns the messages that concern the
  caller, newest first:

  ```ts
  { items: Array<{ message: Message, room: { id, type, name, parentId }, mentionsMe, unread }>, nextCursor }
  ```

  - `limit` defaults to 30, capped at 100.
  - The cursor is opaque (the last `(seq, messageId)` pair, encoded like the
    members cursor).
  - Filtered like the counter; read rows stay listed with `unread: false`.
- No new realtime event. Clients update from the events they already receive
  (C3).

### S6. History around a message

`GET /rooms/:id/messages` accepts exactly one of `before`, `after` or `around`
(`422` otherwise):

- `after=<seq>`: the oldest `limit` messages with `seq > after`, ascending.
- `around=<seq>`: `floor(limit/2)` messages with `seq < around`, plus the
  rest from `seq >= around`.
- The response gains `hasMoreNewer: boolean`, always `false` for the default
  and `before` pages.
- `lastSeq` keeps its meaning (room head read first).

### S7. Protocol, OpenAPI, docs

- **[messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md):**
  - mention targets, tokens and audience;
  - `PATCH` `mentions`;
  - `mentionsMe`;
  - `before` / `after` / `around` and `hasMoreNewer`;
  - `/me/mentions` and `/me/mentions/unread`;
  - new error codes.
- **[rooms-and-permissions.md](../../../../docs/protocol/rooms-and-permissions.md):**
  - groups endpoints;
  - `room.manage_groups`;
  - `group_changed`.
- **[protocol CHANGELOG](../../../../docs/protocol/CHANGELOG.md):** a breaking
  entry for the `mentions` shape.
- **Design page.** New `docs/technical/mentions.md` (targets vs audience,
  tokens, frozen resolution, alternatives above), linked from
  [docs/technical/README.md](../../../../docs/technical/README.md).
- **OpenAPI.** `openapi:emit` regenerates the description; `bun run generate`
  regenerates the SDK types.

## 4. SDK (`packages/sdk`)

- [types/events.ts](../../../../packages/sdk/src/types/events.ts):
  - `MessageCreatedEvent.content.mentions: MentionTarget[]`;
  - new `GroupChangedEvent`.
- [resources/messages.ts](../../../../packages/sdk/src/resources/messages.ts):
  - `SendMessageBody.mentions?: MentionInput[]`;
  - `edit(roomId, messageId, { body, mentions? })`. If
    [`web-client-message-actions`](../web-client-message-actions/overview.md)
    has not added `edit` yet, it is added here.
  - `ListMessagesParams` gains `after` and `around`.
- New `client.mentions`: `list({ cursor, limit })`, `unread()`.
- New `client.groups`: `list(roomId)`, `get(roomId, groupId)`,
  `create(roomId, body)`, `rename`, `remove`, `addMember`, `removeMember`.
- Wire types re-exported from the generated DTOs via `wire.ts`. A changeset
  (`minor`) is added.

## 5. Web client (`apps/client-web`)

### C1. Composer (`features/chat`)

- **Editor.** [composer.tsx](../../../../apps/client-web/src/features/chat/components/composer.tsx)
  is rebuilt on TipTap 3, as decided in
  [web client composer editor](../../../../docs/technical/web-client-composer-editor.md):
  - restricted-Markdown schema, `@tiptap/markdown` for body in and out;
  - `immediatelyRender: false`;
  - the current Enter / Shift+Enter / blank rules are kept.
  - `onSend(body)` becomes `onSend({ body, mentions })`.
- **Mention node** (`lib/mention-node.ts`): an atomic inline node with
  `{ type, target, token, label }` attributes.
  - It renders as a coloured chip `@label`: display name, `all`, role label or
    group name.
  - `renderMarkdown` outputs `token`. The client computes the same token the
    server will freeze: `@identifier`, `@all`, `@<role>`, `@<name>`.
  - On send, `mentions` is the de-duplicated list of the nodes' targets.
  - When loading a message for editing, the body is parsed and each occurrence
    of one of the message's tokens becomes a node again, with the same rule
    as C2. The edit sends the full list (S3).
- **Suggestion** (`hooks/use-mention-suggestions.ts`), triggered by `@` through
  `@tiptap/extension-mention`. Items:
  - members from `useRoomMembers(roomId)` (`shared/members`);
  - `@all` and the five roles, channels only;
  - groups from `useRoomGroups(roomId)` (`shared/groups`).

  Filtering is case-insensitive on display name, identifier and name.
  Sections: people, groups, roles, `@all`. Arrow keys navigate, Enter or Tab
  picks, Esc closes.
- **Failures.** `SendFailureReason` gains `mention_invalid`, mapped from
  `message.mention_not_member` and `message.mention_invalid`.

### C2. Rendering (`shared/messages`)

`MessageBody` and `markdown-allow-list.ts` move from `features/chat` to
`shared/messages`, so that "My mentions" renders bodies too (F11).

- **Chip insertion.** A remark plugin (`lib/remark-mentions.ts`) receives the
  message's `mentions`. It splits `text` nodes, never `inlineCode` / `code`,
  on exact token matches: longest token first, and the next character must not
  be `[a-z0-9_.-/]`. Each match becomes a `mention` node
  (`data.hName = 'mention'`, with the target index).
  - `mention` is added to `ALLOWED_ELEMENTS`
    ([markdown-allow-list.ts](../../../../apps/client-web/src/features/chat/lib/markdown-allow-list.ts)).
  - `components.mention` renders `MentionChip`.
  - `MessageBody` takes `mentions`.
- **`MentionChip`** resolves its target:
  - `user`: `useRoomMembers`, then `useUserSummaries` for ids missing from it
    (same resolution as `use-authors`, members technical.md §6.3).
    - Current member: `@displayName`; clickable, opens `ProfileCardPopover`.
    - Left: `@displayName 🚪`.
    - Deleted (null identifier): the raw token plus 💀, not clickable.
  - `all` / `role`: a localised label with an icon.
  - `group`: current group name from the groups query; a deleted group shows
    the raw token, muted.
  - Each kind has its own colour and icon (person, role, group, whole room).
- **Highlight.** `message-item.tsx` highlights a message when `mentionsMe` is
  set: a strong tint for `direct`, a lighter one for `collective`.

### C3. Live "concerns me" (`shared/mentions/mentions-me.ts`, re-exported by `features/chat/lib/mentions-me.ts`)

The derivation lives in `shared/` because the unread counters (C5) need it outside the
chat feature.

- **Live events.** The event carries no per-viewer value (F8), so on a
  `message_created` the client derives `mentionsMe` from the targets:
  - `user` equal to me: `direct`;
  - `all`: `collective`. Receiving the event means I am an effective member
    now, which is send time.
  - `role` equal to my effective role in the room (from the members list in the
    query cache, `RoomGate` only hands capabilities): `collective`;
  - `group` whose `isMember` is true in `useRoomGroups`: `collective`.

  The author never concerns themselves.
- **Reconciliation.** REST pages carry the server value and replace the derived
  one on the next load. `message_edited` already refetches the message (F3).
- The timeline type `TimelineMessage` gains `mentions: MentionTarget[]` and
  `mentionsMe`.

### C4. Groups data (`shared/groups`, settings in `features/rooms`)

- **Read side.** `useRoomGroups(roomId)` in `shared/groups`, key
  `['groups', roomId]`, `staleTime` 30 s. Invalidated by a
  `group_changed` event for that node, and refetched when the suggestion popup
  opens if stale.
- **Settings.** The "Groups" tab is a component in `features/rooms`
  (`components/room-groups.tsx`). It lists groups defined on the node,
  inherited ones read-only, with create, rename, delete and members
  add/remove, the member picker reading `useRoomMembers`. It is gated on
  `room.manage_groups`.
  - It is mounted by
    [`web-client-room-settings`](../../../features/web-client-room-settings/overview.md). If
    that feature has not shipped, it is reachable from the room header menu at
    `/rooms/$roomId/groups`, mirroring `/rooms/$roomId/requests`.

### C5. Unread counters, "My mentions", jump to a message

- **Counters.** `useUnreadMentions()` in `shared/mentions`, key
  `['mentions', 'unread']`, on `client.mentions.unread()`. The invalidation
  hook `useUnreadMentionsLive()` is mounted once by the `_app` layout.
  - The per-room badge sits in
    [room-tree.tsx](../../../../apps/client-web/src/features/rooms/components/room-tree.tsx),
    next to the unseen dot: a filled badge when `direct > 0`, an outlined one
    for collective only.
  - Invalidated by:
    - a `message_created` whose derived `mentionsMe` is set (C3), unless it is
      the active room;
    - my own `receipt_updated`;
    - `message_edited` / `message_deleted` in a room with a non-zero count.

    Invalidations are coalesced to at most one refetch per second.
- **"My mentions"**, a new `features/mentions`:
  - a sidebar section registered at `order` before rooms: an entry "My
    mentions" with the total unread;
  - route `/_app/mentions` (`routes/_app/mentions.tsx`): an infinite list on
    `client.mentions.list`, each item showing room, author, time, the rendered
    body (`MessageBody` from `shared/messages`), and a direct / collective
    marker.
  - Opening an item navigates to `/rooms/$roomId?at=<seq>`.
- **Jump to a message.** `$roomId.tsx` validates an `at` search param and passes
  it to `RoomChat`. With `at`:
  - `use-timeline` loads `messages.list(roomId, { around: at })`, and marks
    the timeline detached (`hasMoreNewer`);
  - the message is scrolled into view and briefly outlined.
  - While detached:
    - scrolling down loads `after` pages until `hasMoreNewer` is false, after
      which the timeline behaves as today;
    - `message_created` events are not inserted (they would leave a gap), but
      edits and deletions apply to loaded messages;
    - a "Jump to latest" button resets to the newest page.
  - [timeline.ts](../../../../apps/client-web/src/features/chat/lib/timeline.ts)
    gains `hasMoreNewer`, `appendNewer` and the detached rule in
    `applyEvent`.
- **i18n.** Strings under `mentions.*` and `chat.mentions.*` in both
  `common.json` catalogues.

## 6. Dependencies and order

- [`web-client-members`](../web-client-members/overview.md) first: the lookup of
  users who are no longer members (chips of users who left).
- [`web-client-read-state`](../web-client-read-state/overview.md) first: read
  markers for effective members (F5), and the client setting them. Without
  it, unread counts only decrease for explicit members.
- [`web-client-message-actions`](../web-client-message-actions/overview.md):
  message editing UI. Mentions extends its edit path. If mentions ships first,
  only the server/SDK edit support lands here.
- [`web-client-composer-formatting`](../web-client-composer-formatting/overview.md)
  comes after: it adds a toolbar and marks to the TipTap composer built here.
- [`web-client-room-settings`](../../../features/web-client-room-settings/overview.md) hosts the
  groups tab (fallback route otherwise, C4).
- [`notifications`](../../../features/notifications/overview.md) consumes
  `message_mention_recipient`: rows with an edit `seq` are the "added on
  edit" mentions.

## 7. Tests

- **Server, unit:**
  - `MentionResolver`: every target type, collective targets refused in DMs,
    group visibility, author excluded, audience at send time.
  - Group name rules and chain uniqueness.
- **Server, e2e** (`conversations-mentions.e2e-spec.ts`,
  `conversations-groups.e2e-spec.ts`):
  - send with each target type;
  - an inherited member can be mentioned (F1 regression);
  - edit adds, keeps and removes targets, with recipient `seq` checked;
  - `mentionsMe` per viewer;
  - unread counts before and after `PUT /receipt`;
  - `/me/mentions` pagination and redaction filtering;
  - `around` / `after`;
  - groups CRUD, permissions, name conflicts on create, rename and move,
    cleanup on leave;
  - backfill migration.
- **SDK:** resource tests for `messages` (new params, `edit`), `mentions`,
  `groups`; event type tests.
- **Client:**
  - `remark-mentions` (tokens in code ignored, boundaries, longest match);
  - `mentions-me` derivation;
  - timeline detached window;
  - composer: suggestion pick, serialisation to tokens, edit round trip;
  - `MentionChip` states (member, left, deleted, role, group, deleted group);
  - room-tree badge;
  - "My mentions" page and jump.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-mentions`, in dependency order.

| Issue | Task | Depends on |
| ----- | ---- | ---------- |
| [#168](https://github.com/marmotz/ekoz/issues/168) | Server: room groups, `room.manage_groups`, shared effective members query (S1, S4) | none |
| [#169](https://github.com/marmotz/ekoz/issues/169) | Server: `GET /rooms/:id/messages` `after` and `around` (S6) | none |
| [#173](https://github.com/marmotz/ekoz/issues/173) | Server: mention targets, audience, edit and `mentionsMe` (S1 to S3) | #168 |
| [#174](https://github.com/marmotz/ekoz/issues/174) | Server: unread mention counters and `GET /me/mentions` (S5) | #173 |
| [#175](https://github.com/marmotz/ekoz/issues/175) | SDK: mention targets, edit, `after` / `around`, `mentions` and `groups` resources (§4) | #168, #169, #173, #174 |
| [#176](https://github.com/marmotz/ekoz/issues/176) | Client: mention chips, highlight, live `mentionsMe`, shared groups query (C2 to C4) | #175, #125, #126 |
| [#177](https://github.com/marmotz/ekoz/issues/177) | Client: TipTap composer with `@` suggestions (C1) | #176 |
| [#178](https://github.com/marmotz/ekoz/issues/178) | Client: room groups settings (C4) | #176 |
| [#179](https://github.com/marmotz/ekoz/issues/179) | Client: jump to a message and detached timeline (C5) | #175 |
| [#180](https://github.com/marmotz/ekoz/issues/180) | Client: unread mention badges and "My mentions" page (C5) | #176, #179 |
| [#181](https://github.com/marmotz/ekoz/issues/181) | Docs: `docs/technical/web-client-mentions.md` | #177, #178, #180 |
