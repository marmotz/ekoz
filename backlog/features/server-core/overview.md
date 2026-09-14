# Server core

**Status**: [technical design](technical.md)

## Context

Every other feature needs a running server: an application skeleton, a
configuration system, a database, a way to create the first owner, a server
identity (domain and signing keys), and a few shared infrastructure services
(object storage, outbound email, audit log). None of this belongs to a single
functional feature, so it is scoped on its own and delivered first.

## Goal

Provide the foundations the first increment builds on:

- the server application skeleton (Bun + NestJS 12 + Prisma 8 + PostgreSQL,
  Docker image, CI);
- the layered configuration system (TOML file + env + database overrides) and its
  parameter registry;
- server initialization: first owner creation, Ed25519 signing keypair,
  `.well-known/ekoz` discovery document;
- shared infrastructure services: modular object storage with content-hash
  deduplication (local driver), modular outbound email (SMTP driver), audit log
  storage, health/readiness endpoints.

## Decisions made

- Stack and layout follow [repository layout](../../../docs/technical/architecture.md)
  and [server stack](../../../docs/technical/server-stack.md).
- Configuration follows the layered model of
  [configuration model](../../../docs/technical/configuration-model.md): each
  parameter is typed `infra` (file/env only) or `runtime` (overridable via a
  `settings` table by the admin), with the environment able to lock a parameter.
- Server initialization follows
  [server initialization](../../../docs/technical/server-initialization.md): a fixed
  `EKOZ_INITIAL_OWNER_EMAIL`, or a single-use setup token printed to the logs;
  the setup endpoint closes permanently once the first owner exists.
- The server has an Ed25519 signing keypair generated at initialization, published
  through `/.well-known/ekoz`, rotatable with an overlap window
  ([federation protocol](../../../docs/technical/federation-protocol.md)). It is
  used to sign tokens until federation exists.
- The `server` part of the `name/server` identifier is a real domain, validated,
  no `localhost` ([user identifier](../../../docs/technical/user-identifier.md)).
- Object storage is modular (`local` and `s3`-like drivers) with a `blob` /
  `attachment` split and content-hash deduplication
  ([file storage and quotas](../../../docs/technical/file-storage-and-quotas.md)). The
  first increment ships the `local` driver and the deduplicated schema;
  per-user quotas, MIME filtering and per-message attachments are delivered with
  [content and sharing](../content-and-sharing/overview.md).
- Outbound email is modular; the first increment ships the SMTP driver only
  ([the design records of the functional spec / notifications](../notifications/overview.md)).
  Email templates are in English.
- Every administration and global moderation action is written to a dated,
  attributed audit log; the storage lives here, writes come from the features.

## Feature order

- [Identity and profiles](../identity-and-profiles/overview.md) is the first
  feature to build on this core (accounts, sessions, profile, avatars via object
  storage, verification and reset via email).
- [Server administration](../../_archives/features/server-administration/overview.md) later exposes the
  configuration, the audit log and supervision through the web admin.
