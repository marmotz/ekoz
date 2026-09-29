# File storage and quotas

## Context

File sharing must stay modular on the storage side and must not let a user
saturate the server. Avatars are files too. The
[content and sharing](../../backlog/_archives/features/content-and-sharing/technical.md)
feature (message attachments, link previews) grounded the original decisions
below in real code and revised two of them: quota accounting and blob
garbage collection.

## Decision

- **Modular storage driver**: `StorageDriver` interface
  (`put` / `get` / `delete` / `getRange?` / `presignGet?` / `healthCheck`,
  [storage-driver.ts](../../apps/server/src/core/storage/storage-driver.ts)).
  Two implementations: `local` ([local-storage.driver.ts](../../apps/server/src/core/storage/local-storage.driver.ts))
  and `s3` ([s3-storage.driver.ts](../../apps/server/src/core/storage/s3-storage.driver.ts),
  see "S3-compatible driver" below). Keys are content-addressed
  (`blobs/<hash[0:2]>/<hash>`), so a `put` for an existing key is idempotent.
- **Blob / attachment split**:
  - `blob`: physical content, identified by content hash, **deduplicated** (one
    blob, N references). Accounted for from the start so it stays possible.
  - `attachment`: reference to a blob from a message **or** a profile (avatar).
    Message attachments are `MessageAttachment` rows
    (`apps/server/src/core/prisma/contract.prisma`), each pointing at a `Blob`.
- **MIME filtering** by actual type (magic bytes), never by extension or declared
  `Content-Type`. Two modes chosen by the owner: `blocklist` ("allow all except")
  or `allowlist` ("deny all except"). Detection is
  [sniff-content-type.ts](../../apps/server/src/core/storage/sniff-content-type.ts):
  `file-type` first, then a UTF-8-with-no-NUL heuristic for `text/plain`, else
  `application/octet-stream`.
- **Limits**: max size per file (`uploads.max_file_bytes`), **per-user quota**
  (sum of the blobs the user originally uploaded), global storage capacity
  (`storage.capacity_bytes`). Exceeding → upload refused, unless the user quota
  is raised / unlimited.
- **Accounting is computed, not maintained.** `StorageQuotaService`
  ([storage-quota.service.ts](../../apps/server/src/core/storage/storage-quota.service.ts))
  sums `Blob.sizeBytes` for `Blob.uploaderId = user AND refCount > 0` plus the
  declared `length` of that user's `receiving` uploads (reserved, not yet
  ingested) — a query on the indexed `uploaderId`, not a counter table. This
  **replaces** the "accounting table (user, room, global), updated on upload and
  release" originally decided here: a maintained counter can drift from
  `Blob.refCount` (double-decrement, a crashed transaction, dedup edge cases),
  a query on an indexed column cannot, and no product decision ever needed a
  per-room total. `GET /me/storage` and the admin dashboard both call the same
  service. The check that a new upload fits — quota, then global capacity — runs
  inside a transaction holding `pg_advisory_xact_lock(hashtext(userId))`, so two
  concurrent uploads from the same user cannot both pass a check that only one
  of them should.
- **Blobs record their uploader.** `Blob.uploaderId` is the user charged for
  that content; it is set once, on the hash's first ingest
  ([blob.service.ts](../../apps/server/src/core/storage/blob.service.ts)), and
  never changed when the same hash is uploaded again by someone else — the
  first uploader keeps the charge, matching "an original uploader is charged,
  not each reference" below. Content ingested on the platform's own behalf
  (thumbnails, cached link-preview images) passes `uploaderId: null` and is
  never charged against anyone's quota.
- **Blob garbage collection has a "clock", not a creation date.** `Blob` carries
  `touchedAt`, refreshed on every ingest (including a dedup hit) and on every
  `retain` / `release`. The sweep
  ([blob-gc.service.ts](../../apps/server/src/core/storage/blob-gc.service.ts),
  every 15 minutes) is one statement —
  `DELETE FROM blob WHERE ref_count = 0 AND touched_at < cutoff RETURNING …` —
  so the `refCount` check happens inside the same statement that deletes the
  row: there is no read-then-delete window where a caller's `retain` could lose
  a race against the sweep. `storage.gc_grace_seconds` (default 1 h) is the
  cutoff. This replaced an earlier "created more than grace ago" rule, which
  could delete a blob that was ingested, sat unreferenced for longer than the
  grace period because of normal request latency, and was about to be attached.
- **Access**: authenticated download. Private room → current members only. Public
  room → authentication still required. See
  [signed file URLs](signed-file-urls.md) for how a download is actually served.
- **Retention**: an attachment follows the retention rule of its message
  (see [retention and tombstones](retention-and-tombstones.md)).

### S3-compatible driver

`S3StorageDriver` (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage` +
`@aws-sdk/s3-request-presigner`), selected by the infra parameter
`storage.driver = "s3"` (default `local`). `put` uses a multipart upload (the
library picks single- vs multi-part automatically), `get` streams the object
body, `delete` is idempotent (S3's `DeleteObject` already is), `presignGet`
signs a time-limited GET with `response-content-disposition` /
`response-content-type` overrides, and `healthCheck` does a `HeadBucket`.
`Bun.S3Client` was **not** used even though the server runs on Bun: unit and
integration tests run under Node/Vitest
([vitest.config.ts](../../apps/server/vitest.config.ts), `environment: 'node'`),
so a Bun-only built-in would be untestable in that suite.

Operator configuration: `storage.s3.endpoint`, `storage.s3.region`,
`storage.s3.bucket` (required when the driver is `s3`, checked at boot),
`storage.s3.access_key_id` / `storage.s3.secret_access_key` (secrets, omit to
use the AWS SDK's default credential chain), and
`storage.s3.force_path_style` (default `false`; set `true` for MinIO and most
self-hosted S3-compatible stores). All `infra`-kind: file or environment only,
not admin-editable — see [configuration model](configuration-model.md).
Integration coverage runs the same driver contract suite as the local driver
against a MinIO `testcontainers` container
([s3-storage.driver.e2e-spec.ts](../../apps/server/src/core/storage/s3-storage.driver.e2e-spec.ts)).

Alternative not retained: keeping only `local`. File attachments are what
actually needs volume, and horizontal scalability needs object storage
eventually.

### Operator notes

- **Upload staging is local-disk and single-instance.** Whatever the
  configured `StorageDriver`, in-flight resumable uploads are staged on the
  server's own filesystem (`storage.upload_staging_path`, default
  `./var/uploads`) before being streamed into the driver on completion — see
  [resumable uploads](resumable-uploads.md#operator-notes) for what that means
  for running more than one server instance.
- **ffmpeg/ffprobe are optional** and only affect thumbnails and media
  metadata, not storage or quotas — see
  [media thumbnails](media-thumbnails.md#operator-notes).

## Consequences

- Dedup requires reasoning in counted references from the initial schema.
- Quota computation must stay consistent with dedup: the original uploader is
  charged, not each reference.
- Because usage is a query, not a counter, `StorageQuotaService` reads stay
  cheap only as long as `Blob.uploaderId` is indexed; the migration that added
  the column also added `@@index([uploaderId])`.
- `Blob.sizeBytes` is `BigInt` (`int4 → int8` migration, in place, no data
  loss): the original `int4` had a 2 GiB ceiling incompatible with sharing
  larger files.
