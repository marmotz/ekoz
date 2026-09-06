# 0011 — File storage and quotas

**Status**: accepted

## Context

File sharing must stay modular on the storage side and must not let a user
saturate the server. Avatars are files too.

## Decision

- **Modular storage driver**: `StorageDriver` interface
  (`put` / `get` / `delete` / `presignedUrl`). At least `local` and `s3`-like
  implementations, extensible.
- **Blob / attachment split**:
  - `blob`: physical content, identified by content hash, **deduplicated** (one
    blob, N references). Accounted for from the start so it stays possible.
  - `attachment`: reference to a blob from a message **or** a profile (avatar).
- **MIME filtering** by actual type (magic bytes), never by extension or declared
  `Content-Type`. Two modes chosen by the owner: `blocklist` ("allow all except")
  or `allowlist` ("deny all except").
- **Limits**: max size per file, **per-user quota** (sum of the blobs the user
  originally uploaded), global storage capacity. Exceeding → upload refused,
  unless the user quota is raised / unlimited.
- **Accounting**: an accounting table (user, room, global) updated on upload and
  on release. Message deletion, removal by moderation or retention expiry release
  the quota (reference count decrement; physical blob deleted when no reference
  remains).
- **Access**: authenticated download. Private room → current members only. Public
  room → authentication still required.
- **Retention**: an attachment follows the retention rule of its message
  (see [ADR 0012](0012-retention-and-tombstones.md)).

## Consequences

- Dedup requires reasoning in counted references from the initial schema.
- Quota computation must stay consistent with dedup: the original uploader is
  charged, not each reference.
