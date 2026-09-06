# server — object storage with deduplication (local driver)

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §6](../../features/server-core/technical.md#6-object-storage)
and [file storage and quotas](../../../docs/technical/file-storage-and-quotas.md).

## To do

1. `StorageDriver` interface (`put`, `get`, `delete`, optional `presignGet`).
2. `local` driver: writes under `storage.local.path`, content-addressed key
   `blobs/<hash[0:2]>/<hash>`, `presignGet` → `null`. `s3` driver: config schema
   only, not implemented.
3. `Blob` Prisma model (`id`, `hash` unique, `sizeBytes`, `contentType`,
   `storageKey`, `refCount`, `createdAt`).
4. `BlobService.ingest(stream, { declaredType })`: stream to a temp location
   while hashing (SHA-256); if the hash exists, discard and return the existing
   blob; else move into the driver and insert.
5. `retain(blobId)` / `release(blobId)` adjusting `refCount` within the caller's
   transaction.
6. GC sweep worker: delete driver objects + rows for `refCount = 0` older than a
   grace period (config, default 1h).
7. `GET /blobs/:id`: authenticated; an access-policy hook the referencing feature
   implements (identity for avatars, content-and-sharing for attachments);
   strong caching with `ETag = hash`.

## Dependencies

- [2-prisma-setup](server-2-prisma-setup.md)
- [4-config-system](server-4-config-system.md)
- [3-http-conventions](server-3-http-conventions.md)
