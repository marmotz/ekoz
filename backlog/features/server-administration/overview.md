# Server administration

**Status**: in discussion

## Context

The server targets operators with very varied skills and contexts. Its
administration must therefore stay understandable and safe, from the home server
to the public or private organisation.

## Goal

Allow configuring, supervising and moderating a server, as well as administering
its users and its spaces.

## Decisions made

- Routine administration operations are done through a web interface;
  infrastructure parameters stay configurable at deployment time.
- The first owner account is created explicitly when the server is initialized:
  either through an email address fixed at deployment (the only one allowed), or
  through a single-use token printed in the logs. The initialization endpoint
  closes permanently afterwards. See
  [ADR 0010](../../../docs/technical/adr/0010-server-initialization.md).
- A server can have several owners.
- The owner can create accounts, reset passwords, suspend or delete accounts and
  grant or revoke administration roles.
- A suspension invalidates existing sessions and blocks login as well as any
  access to the server until reactivation.
- Global moderation allows banning a user from the server, receiving reports,
  deleting a message or content server-wide and managing any space or room.
- Every administration and global moderation action is recorded in a dated,
  attributed audit log.
- The supervision interface shows users and their activity, storage usage, server
  health and, when available, federation state.
- Configuration follows a layered model: a TOML file at deployment, overrides
  from the admin for `runtime` parameters, with the environment able to lock a
  parameter. The admin never writes to the file. See
  [ADR 0009](../../../docs/technical/adr/0009-configuration-model.md).

## Depends on

- [Identity and profiles](../identity-and-profiles/overview.md), for
  administering accounts and roles.

## Feature order

- [Conversations](../conversations/overview.md) introduce the server owner role,
  which holds global administration.
- [Content and sharing](../content-and-sharing/overview.md) expose the storage
  and link preview settings to the server owner.
- [Notifications](../notifications/overview.md) expose channel enablement and the
  global rules to the server owner.
- [Federation](../federation/overview.md) exposes peer approval, supervision and
  relationship severing to the server owner.
- [Extensibility](../extensibility/overview.md) exposes extension installation,
  approval and enablement to the server owner.
