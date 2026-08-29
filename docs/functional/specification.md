# Global functional specification

## Vision

Ekoz is an open source federated messaging server. It aims for a much simpler
experience and operation than Synapse, without giving up the capabilities
expected of a modern messaging platform.

A standalone server must be fully useful on its own. Federation is optional and
progressive. The protocol is new and is not compatible with Matrix.

The product must be deployable by any kind of operator: individual, community,
association, company or public administration. It is distributed as a container
image and stays manageable with few operational dependencies.

> Architecture and technology choices are recorded in the
> [architecture decision records](../technical/adr/).

## Product scope

The project provides a reference server and a reference web client. The core
covers local accounts, conversation spaces, content sharing, notifications,
administration and fine-grained permissions. Federation and extensions enrich
this core without making it mandatory.

Traffic uses TLS. End-to-end encryption and multi-factor authentication are not
part of the first increment.

## Identity and profiles

- An account has a stable public identifier of the form `name/server` (for
  example `alice/chat.example`, displayed as `@alice/chat.example`), distinct
  from the display name. The `name` is lowercase, restricted to the characters
  `[a-z0-9_.-]`, at most 64 characters, unique on its server.
- The public profile contains a display name, an avatar and a short biography.
- The owner chooses whether registration is open, invite-only or reserved to
  administrators.
- A verified email address is mandatory; it enables account recovery and email
  notifications. The owner can disable verification for deployments without a
  mail server.
- The owner chooses whether the identifier is immutable, freely changeable
  subject to availability, or changeable subject to administrative approval.
- Deleting an account erases its profile data and anonymises the author of its
  retained messages.

## Spaces and conversations

- A space contains sub-spaces and rooms, with no imposed nesting depth (a soft
  limit is configurable, 4 by default). Only rooms contain messages. A space can
  contain both sub-spaces and rooms.
- Rooms are public, private or invite-only. Public rooms appear in a directory
  and can be joined or left by any authenticated user.
- One-to-one (`dm`) and private group (`group_dm`) conversations are rooms of a
  dedicated type: same engine for messages, attachments and history, but outside
  the space hierarchy, outside the directory, with fixed membership (or
  membership managed without roles) and flattened roles. A one-to-one
  conversation is deduplicated: only one per pair of users.
- The roles are: server owner, space administrator, room administrator,
  moderator, member and reader. Permissions are inherited from a space down to
  its rooms, with per-room overrides. A child can therefore be more restricted
  than its parent.
- Administrators create the structure. Moderators can remove or ban a member
  from a room.
- The author can edit or delete their message. These actions remain flagged
  without revealing the previous content.
- Messages support replies, reactions, mentions and read receipts visible to
  participants. Dedicated threads are deferred.
- Presence (online / away / offline) and typing indicators are available from
  the messaging increment.
- Retention is defined by default at the server level and can be overridden in a
  space or room, subject to the required permissions. On expiry, a rule chooses
  between:
  - **hiding**: the message is removed from the UI but kept in the database,
    reversible and visible to moderation;
  - **deletion**: the actual content is erased from the database; only a
    contentless audit marker remains, preserving the ordering of the history.

## Content and sharing

- The owner chooses the file type filtering mode: "allow all except" (list of
  blocked types) or "deny all except" (list of allowed types). The type is
  determined from the actual content, not from the extension. The default mode is
  "allow all except" with an empty list.
- The owner configures the maximum size per file, a per-user quota and the global
  storage capacity. A user cannot exceed their quota unless the owner raises it
  or makes it unlimited.
- Identical files are stored physically only once; the quota is charged to the
  original uploader and released when the file is no longer referenced (message
  deletion, removal by moderation, retention expiry).
- File access requires authentication, including in a public room. In a private
  room, only current members can download a shared file, even with its link.
- Physical storage is modular: local disk, S3-compatible service or other.
- Profile avatars are files handled by the same system.
- The web client renders images, audio and video it supports inline.
- An attachment follows the retention rule of its message. The author or
  authorised moderation can remove it before expiry.
- Link previews are a server option.

## Notifications

- The internal notification centre handles direct messages, mentions, replies,
  invitations, moderation actions and new messages in followed rooms.
- It is independent from the delivery channels. The first increment ships the
  adapters for the web app and email (SMTP, modular driver). Channels are
  modular. Emails are in English for now.
- Rules are configured at the server, space and user level, globally or per
  room. Administrative restrictions take precedence.
- An in-app notification can be immediately followed by an email after a
  configurable delay if it has not been read. Emails are rate-limited to avoid
  repetition.
- Security and moderation alerts cannot be disabled and remain at least visible
  in the internal centre.

## Administration and moderation

- Routine administration is done through a web interface; infrastructure
  parameters are set at deployment time.
- The first owner is created at initialization, either through an email address
  fixed at deployment (the only one allowed to create that account) or through a
  single-use token printed in the server logs. The initialization endpoint
  closes permanently afterwards. Multiple owners are possible.
- The owner manages accounts, passwords, suspensions, deletions and
  administration roles.
- A suspension invalidates existing sessions and blocks any login or access
  until reactivation.
- Global moderation allows server-wide bans, handling reports, server-wide
  content deletion and management of every space and room.
- Every administration and global moderation action is logged in a dated,
  attributed audit log.
- Configuration follows a layered model: a TOML file at deployment, overrides
  from the admin for `runtime` parameters, with the environment able to lock a
  parameter. The admin never writes to the file. See
  [ADR 0009](../technical/adr/0009-configuration-model.md).
- The supervision interface exposes users and their activity, storage usage,
  server health and, when available, federation state.

## Federation

- Two servers federate after mutual approval by their owners.
- Federation covers shared rooms, private messages, file sharing, presence and
  read receipts.
- The user keeps the identity and profile from their home server.
- The server that creates a federated room manages its structure, rules and
  roles. Each server can moderate its own users.
- An owner can sever a relationship with immediate effect. Already-received
  content remains under local retention, with no further exchange.
- Migrating an account to another server is deferred.

## Extensibility

- Extensions can provide new content types, inbound or outbound integrations,
  notification channels and client features.
- Only the owner installs, approves, enables, updates or disables them.
- Each extension receives only the explicit minimal permissions it needs.
- A failing extension must not interrupt native messaging.
- Clients and servers that do not know an extension content type render it with a
  standard fallback.

## Proposed increments

1. **Core and messaging** (first increment): deployment, initial owner, local
   identity, basic administration, demonstration client, then spaces, rooms,
   permissions, messages, presence, retention and local moderation. A server
   shipped at increment 1 is already usable as a standalone messaging platform.
2. Content and notifications: files, links, notification centre and email.
3. Federation: peer approval, cross-server conversations and content.
4. Extensibility: content types, integrations, notification adapters and client
   features.

The order beyond the first increment is a delivery proposal, not an additional
product decision.

## Detailed scoping

- [Identity and profiles](../../backlog/features/identity-and-profiles/overview.md)
- [Conversations](../../backlog/features/conversations/overview.md)
- [Content and sharing](../../backlog/features/content-and-sharing/overview.md)
- [Notifications](../../backlog/features/notifications/overview.md)
- [Server administration](../../backlog/features/server-administration/overview.md)
- [Federation](../../backlog/features/federation/overview.md)
- [Extensibility](../../backlog/features/extensibility/overview.md)
