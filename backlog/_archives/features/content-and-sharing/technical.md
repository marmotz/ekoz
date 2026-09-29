# Content and sharing — technical design

Technical design for file and link sharing across `apps/server`, `packages/sdk`,
`apps/client-web` and `apps/admin`. Product decisions are in
[overview.md](overview.md); this page grounds them in the code.

Related: [file storage and quotas](../../../../docs/technical/file-storage-and-quotas.md),
[configuration model](../../../../docs/technical/configuration-model.md),
[retention and tombstones](../../../../docs/technical/retention-and-tombstones.md),
[permission model](../../../../docs/technical/permission-model.md),
[messages and interactions protocol](../../../../docs/protocol/messages-and-interactions.md),
[conversations technical design](../conversations/technical.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | `BlobService` already does content-addressed ingest (hash to a temp file, reuse an existing row, else `driver.put` + insert) with `retain` / `release` counters. `IngestOptions.declaredType` is stored as is; magic-byte validation is left to "content-and-sharing". | [blob.service.ts:47](../../../../apps/server/src/core/storage/blob.service.ts) | Reused. Ingest gains the uploader and the sniffed type. |
| F2 | `Blob` has no uploader column, and `sizeBytes` is an `int4` (2 GiB ceiling) with a comment saying attachments must revisit it. | [contract.prisma:105](../../../../apps/server/src/core/prisma/contract.prisma) | Migration: `sizeBytes` becomes `BigInt`, new `uploaderId`. Quota cannot be computed without it. |
| F3 | GC race: `ingest` can return an existing row at `refCount = 0` whose `createdAt` is older than the grace period; the sweep ([blob-gc.service.ts:49](../../../../apps/server/src/core/storage/blob-gc.service.ts)) can delete it before the caller's `retain` commits. The sweep reads the rows, then deletes them without re-checking `refCount`. | [blob.service.ts:61](../../../../apps/server/src/core/storage/blob.service.ts), [blob-gc.service.ts:53](../../../../apps/server/src/core/storage/blob-gc.service.ts) | Dedup makes this likely once many files are shared. Fixed in S2. |
| F4 | `GET /blobs/:id` is authenticated by Bearer token. Access is **per blob** through `BlobAccessRegistry` (any policy that says yes grants access). The only policy is the avatar one. | [blob.controller.ts:40](../../../../apps/server/src/core/storage/blob.controller.ts), [profile.service.ts:50](../../../../apps/server/src/modules/identity/profile/profile.service.ts) | Access by blob does not fit attachments: one blob can sit in a private room and in a public one, and the filename belongs to the attachment. Attachments get their own download route (S6). |
| F5 | Only the `local` driver exists; `storage.driver = "s3"` throws at boot. The `s3.*` keys are declared in the registry. `presignGet` is optional in the driver contract. | [storage.module.ts:28](../../../../apps/server/src/core/storage/storage.module.ts), [storage-driver.ts](../../../../apps/server/src/core/storage/storage-driver.ts) | S3 driver in S3 (decision in the overview discussion). |
| F6 | Avatar upload goes through multer **memory** storage (`FileInterceptor('file')`), then `fileTypeFromBuffer`. `file-type` only detects binary signatures: plain text, CSV, JSON or source code give `null`. | [profile.controller.ts:72](../../../../apps/server/src/modules/identity/profile/profile.controller.ts), [avatar.ts:17](../../../../apps/server/src/modules/identity/profile/avatar.ts) | Memory buffering is unusable for 25 MiB files; uploads are streamed (S4). Text files need a fallback classification (S5). |
| F7 | `sendMessage` requires `room.post` and a non-empty `body` (`z.string().min(1)`). `editMessage` only takes `body`. `redactMessage` is the shared delete core (user deletion and retention delete mode). The retention hide mode only sets `hiddenAt`, and `listMessages` still returns hidden messages with their body. | [messages.service.ts:38](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [messages.dto.ts](../../../../apps/server/src/modules/conversations/messages/messages.dto.ts), [retention-worker.service.ts](../../../../apps/server/src/modules/conversations/retention/retention-worker.service.ts) | Attachments hook into send, edit and `redactMessage`. A hidden message keeps its attachments, but they are not downloadable by ordinary readers (S6). |
| F8 | `message_created` content is a fixed Zod shape; `message_edited` carries only `{ messageId, editedAt }`, and the web client refetches the message on it. | [room-event.types.ts:93](../../../../apps/server/src/modules/conversations/events/room-event.types.ts), [timeline.ts:196](../../../../apps/client-web/src/features/chat/lib/timeline.ts) | Attachments and the link preview are added to `message_created` (additive). An edit that changes attachments reuses `message_edited` with no client change. |
| F9 | Capabilities are a closed, additive list. The role defaults are upserted on every boot by a seeder. | [capabilities.ts](../../../../apps/server/src/modules/conversations/permissions/capabilities.ts), [role-default-capabilities.seeder.ts](../../../../apps/server/src/modules/conversations/permissions/role-default-capabilities.seeder.ts) | `room.attach` is added to the list and the matrix; existing databases get it on the next boot. |
| F10 | `ConfigService.set` / `clear` / `describe` and the `settings` table exist, but no HTTP route exposes them. Server administration excluded runtime configuration editing. | [config.service.ts:94](../../../../apps/server/src/core/config/config.service.ts), [contract.prisma:28](../../../../apps/server/src/core/prisma/contract.prisma) | New generic `/admin/settings` API (S11). |
| F11 | The SDK transport is `fetch` based: it accepts `FormData` and a `blob` response mode, with no upload progress. The web client loads avatars as a `Blob` through the SDK and shows them with an object URL, because `<img src>` cannot send a Bearer token. | [http-client.ts:85](../../../../packages/sdk/src/transport/http-client.ts), [use-avatar-src.ts](../../../../apps/client-web/src/shared/sdk/use-avatar-src.ts) | Object URLs cannot stream a video. Media use signed URLs (S6). Upload progress comes from chunked uploads (S4, SDK1). |
| F12 | Server tests run under Vitest with `environment: 'node'`, not Bun. | [vitest.config.ts](../../../../apps/server/vitest.config.ts) | Bun-only built-ins (`HTMLRewriter`, `Bun.S3Client`) cannot be used in code that tests exercise. |
| F13 | The composer is a plain textarea with `onSend(body)`. Sending is optimistic (`useSendMessage`), with a pending entry reconciled on success. | [composer.tsx:23](../../../../apps/client-web/src/features/chat/components/composer.tsx), [use-send-message.ts](../../../../apps/client-web/src/features/chat/hooks/use-send-message.ts) | The composer gains an attachment tray and a link preview card; a pending entry carries its uploads. |
| F14 | The boundaries rule forbids a feature module (`src/modules/*`) from importing another one; `src/core/*` is importable by all. | [eslint.config.mjs](../../../../apps/server/eslint.config.mjs) | Uploads, quotas, media and signed URLs go in `core/storage` (shared by identity avatars and conversations). Attachments and link previews go in `modules/conversations`, which owns messages. |

## 2. Server — storage core (`src/core/storage`)

### S1. Schema changes (server-core)

```prisma
model Blob {
  // existing: id, hash, contentType, storageKey, refCount, createdAt
  sizeBytes       BigInt              @map("size_bytes")        // was Int (F2)
  uploaderId      String?             @map("uploader_id")       // original uploader, quota holder
  touchedAt       TimestamptzString   @map("touched_at")        // last ingest / release, GC clock (S2)
  width           Int?                                           // media metadata (S7), null if unknown
  height          Int?
  durationMs      Int?                @map("duration_ms")
  thumbnailBlobId String?             @map("thumbnail_blob_id") // derived blob, never charged to a quota
  @@index([uploaderId])
}

/// A resumable upload (S4). `blobId` is set once the upload is complete and ingested.
model Upload {
  id           String   @id @default(ulid())
  userId       String   @map("user_id")
  filename     String
  length       BigInt                                   // tus Upload-Length
  offset       BigInt   @default(0)
  state        UploadState                              // receiving | ready | failed
  blobId       String?  @map("blob_id")
  failure      String?                                  // error code when failed
  expiresAt    TimestamptzString @map("expires_at")
  createdAt    temporal.createdAtString() @map("created_at")
  @@index([userId, state])
  @@index([expiresAt])
}

/// Owner-set quota for one user; no row = `uploads.default_quota_bytes`. `null` = unlimited.
model StorageQuotaOverride {
  userId     String  @id @map("user_id")
  quotaBytes BigInt? @map("quota_bytes")
  updatedAt  temporal.updatedAtString() @map("updated_at")
}
```

Data migration: `uploader_id` of existing avatar blobs is backfilled from
`user_profile.avatar_blob_id`, and `touched_at` from `created_at`. There are no
cross-module foreign keys (same rule as `UserProfile.avatarBlobId`).

### S2. Blob service: uploader, sniffed type, GC fix

- `ingest(stream, { contentType, uploaderId })`: `contentType` is the sniffed
  type (S5), no longer the declared one. On a **new** hash, `uploaderId` is
  recorded. On an **existing** hash, the row is returned and `touchedAt` is set
  to now. The original uploader keeps the charge, as decided in the overview.
- `release` sets `touchedAt` when `refCount` reaches 0.
- GC (F3): the sweep becomes a single
  `DELETE FROM blob WHERE ref_count = 0 AND touched_at < $cutoff RETURNING storage_key, thumbnail_blob_id`,
  then deletes the driver objects and releases the thumbnail blob. A blob taken
  again between ingest and `retain` has a fresh `touchedAt`, so the sweep skips it.
  The row is re-checked inside the `DELETE`, so there is no read-then-delete window.
- Avatars: `ProfileService.setAvatar` passes `uploaderId` and goes through the
  quota check (S8), because avatars count against the quota as the overview requires.

### S3. S3-compatible driver

`S3StorageDriver implements StorageDriver`, selected when `storage.driver = "s3"`.
It uses the existing `storage.s3.*` keys, plus `storage.s3.force_path_style`
(infra, default `false`, needed for MinIO).
`put` uses a multipart upload, `get` streams, `delete` is idempotent, and
`presignGet(key, ttl, { contentDisposition, contentType })` sets the
`response-content-*` overrides (the driver contract gains this options argument).
`healthCheck` does a `HeadBucket`.

- Library: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (the exact
  versions are checked when implementing). `Bun.S3Client` is not used, because
  unit and integration tests run under Node (F12).
- Integration test: a MinIO container through `testcontainers` (already a dev
  dependency), with the same contract suite as `local-storage.driver.spec.ts`.
- Alternative not retained: keeping only `local`. File attachments are what
  actually needs volume, and the overview requires modular storage.

### S4. Resumable uploads (tus 1.0)

Protocol: [tus 1.0.0](https://tus.io/protocols/resumable-upload) core with the
`creation`, `termination` and `expiration` extensions, under `/uploads`, with
Bearer auth (the normal `AuthGuard`).

| Request | Effect |
|---|---|
| `OPTIONS /uploads` | `Tus-Version`, `Tus-Extension`, `Tus-Max-Size` (= `uploads.max_file_bytes`). |
| `POST /uploads` | `Upload-Length` is required (no `creation-defer-length`). `Upload-Metadata`: `filename` (required), `type` (declared, informational only). Checks size, quota and capacity **before** accepting a single byte (S8). `201` + `Location: /uploads/:id` + `Upload-Expires`. |
| `HEAD /uploads/:id` | `Upload-Offset`, `Upload-Length`. Owner only, otherwise `404`. |
| `PATCH /uploads/:id` | `Content-Type: application/offset+octet-stream`, `Upload-Offset` must match (`409` otherwise). The chunk is appended to the staging file. When `offset = length`, the upload is finalized **synchronously** (S5 sniffing + filter, ingest, S7 thumbnail) before the response. The response then carries `Upload-Offset` plus an `Ekoz-Upload` JSON header `{ id, state, contentType, sizeBytes, width, height, durationMs, hasThumbnail }` or the error code. |
| `DELETE /uploads/:id` | Cancels: deletes staging bytes, releases the blob if `ready`. |
| `GET /uploads/:id` | Non-tus JSON view of the upload state (lets a client recover after a crash). |

- Staging: `storage.upload_staging_path` (infra, default `./var/uploads`), one
  file per upload, always on the local disk whatever the driver. The complete
  file is streamed into `BlobService.ingest`, which moves it to the driver.
- `ready` = ingested. The upload holds **one blob reference** (`retain`) until
  it is attached to a message (the reference moves to the attachment in the same
  transaction) or it expires.
- Expiry: `uploads.pending_ttl` (runtime, default `24h`), measured from
  creation. A sweeper (same pattern as `BlobGcService`, every 15 min) deletes
  expired `receiving` / `failed` uploads and releases the blob of expired `ready` ones.
- Implemented in-house (controller + service), not with `@tus/server`. The
  subset is small (4 verbs), it must reuse `AuthGuard`, the problem+json errors
  and the quota hooks, and it avoids depending on a Node/Bun HTTP adapter we
  would have to check. Chunked `PATCH` requests also give the upload progress
  that `fetch` does not expose (F11).
- Limitation: staging is local to the server instance. Running several
  instances needs a shared volume or sticky sessions. The server is
  single-instance today (in-memory presence), so this is stated in the doc, not solved.

Alternative not retained: a single streamed multipart request. It is simpler,
but cannot resume after a disconnection (overview discussion).

### S5. Type detection and filtering

`sniffContentType(path)` in `core/storage`:
1. `fileTypeFromFile` (`file-type`, already a dependency) → MIME type if detected.
2. Otherwise: if the first 64 KiB decode as UTF-8 with no NUL byte → `text/plain`.
3. Otherwise `application/octet-stream`.

Filter: `uploads.filter_mode` (`blocklist` | `allowlist`, runtime, default
`blocklist`) and `uploads.filter_types` (runtime list, default `[]`). An entry
matches either an exact type (`application/zip`) or a family (`video/*`). A
rejection turns the upload into `failed` with `upload.type_rejected`, and the
staging bytes are deleted before ingest. The declared type and the extension are
never used for the decision, only kept for display.

The `avatar.allowed_mime` rule stays as is (it is stricter, images only) and
reuses `sniffContentType`.

### S6. Downloads through signed URLs

The overview discussion retained short-lived signed URLs, so that
`<img>`, `<video>` and `<audio>` can load directly, with `Range` support.

- `POST /files/urls` (authenticated), body `{ items: FileRef[] }` (max 100), where
  `FileRef` is `{ kind: "attachment", id, variant: "original" | "thumbnail" }`,
  `{ kind: "message_preview", messageId }` or `{ kind: "preview", previewId }`.
  Every item goes through the access check, and the response is `{ items: [{ ref, url, expiresAt } | { ref, error }] }`.
- URL: `GET /files/:token`, where the token is
  `base64url(kind | id | variant | userId | exp) + "." + HMAC-SHA256`. The HMAC key
  is derived from `secret.key` (HKDF, label `ekoz/files-url/v1`, next to the
  secret box helpers). TTL: `files.url_ttl` (runtime, default `1h`, long enough
  for a video watched with `Range` requests).
- **Access is checked again on every request** for the `userId` carried by the
  token, not only when the URL is issued. A user who leaves the room loses access
  at once, even with a valid URL. This is what the overview means by "including
  when they have its link". A leaked URL only works as that user, and only while
  that user keeps access.
- Access rules (`AttachmentAccessPolicy` in conversations, S9): `room.read` on the
  attachment's room, the message not redacted, and if the message is hidden, the
  caller must also hold `room.delete_any` (moderation sees hidden content, as in
  [retention and tombstones](../../../../docs/technical/retention-and-tombstones.md)).
  A cached `preview` item: any authenticated user (public web content, used by the
  composer before sending).
- Serving: `local` driver → streamed with `Range` / `206`, `ETag` = hash,
  `Cache-Control: private, max-age=<remaining TTL>`. `s3` driver → `302` to
  `presignGet` (TTL 60 s) after the check.
- Hardening: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`,
  `Content-Disposition: inline` only for `image/*` (except `image/svg+xml`),
  `audio/*`, `video/*` and `application/pdf`, `attachment; filename*=UTF-8''…` otherwise.
- `GET /blobs/:id` and the avatar policy are unchanged. Avatars keep their route.

Alternatives not retained: blob + object URL through the SDK (the whole video
must download before playback and sits in memory); a session cookie (a second
auth mechanism next to Bearer, CSRF to handle).

### S7. Thumbnails and media metadata (optional ffmpeg)

- Detection at boot (`MediaToolsService.onModuleInit`): runs
  `<media.ffmpeg_path> -version` and `<media.ffprobe_path> -version` (infra,
  defaults `ffmpeg` / `ffprobe`). If either is missing: one `warn` log line
  (`Thumbnails disabled: ffmpeg/ffprobe not found`), the service reports
  `available = false`, and boot continues. The status appears in the boot summary
  and in `GET /admin/storage` (S11).
- On upload finalization (S4), for `image/*` (except SVG) and `video/*` only:
  `ffprobe -of json -show_streams` → `width`, `height`, `durationMs`; then
  `ffmpeg` → one JPEG frame (1 s for a video, clamped to the duration), max
  480 px on the longer side. It is ingested as a blob with no uploader (never
  charged) and set as `Blob.thumbnailBlobId`. The metadata and thumbnail belong to
  the **blob**, so a deduplicated file does not recompute them.
- Safety: arguments passed as an array (no shell), `-protocol_whitelist file`,
  a 15 s timeout (`SIGKILL`), and a failure never fails the upload (no thumbnail,
  `warn` log). A synchronous `PATCH` response is acceptable: generating one frame
  is short next to uploading 25 MiB.

Alternatives not retained: `sharp` (a native npm module, and a second
dependency); asynchronous generation with a readiness event (more protocol for a
short delay).

### S8. Quotas and capacity

- **Usage of a user** = `SUM(size_bytes)` of blobs with `uploader_id = U` and
  `ref_count > 0`, plus `SUM(length)` of U's uploads in state `receiving`. A
  `ready` upload is already counted through its blob reference, and an expired
  pending upload stops counting when its reference is released (overview decision).
- **Quota** = `StorageQuotaOverride.quotaBytes`, or
  `uploads.default_quota_bytes` (runtime, default 1 GiB) when there is no override;
  `null` means unlimited.
- **Global capacity** = `storage.capacity_bytes` (runtime, `null` = unlimited,
  default), compared with `SUM(size_bytes)` of all blobs + `receiving` uploads.
- Checked at `POST /uploads` with the declared `Upload-Length`, inside a
  transaction that takes `pg_advisory_xact_lock(hash(userId))` so two parallel
  creations cannot both pass. A deduplicated file that was reserved against
  quota and then matches an existing blob of another uploader releases the
  reservation (the charge stays with the original uploader).
- Computed with queries on the indexed `uploader_id`, not with a counter table.
  This departs from "an accounting table (user, room, global)" in
  [file storage and quotas](../../../../docs/technical/file-storage-and-quotas.md),
  which is updated accordingly. Counters could drift from `refCount`, the query
  cannot, and no product decision needs a per-room total.
- `GET /me/storage` → `{ usedBytes, pendingBytes, quotaBytes: string | null }`
  (bigints as strings, as `seq` already is).
- Errors: `upload.too_large` (413), `upload.quota_exceeded` (403,
  `details: { usedBytes, quotaBytes }`), `upload.capacity_exceeded` (507),
  `upload.type_rejected` (422), `upload.offset_mismatch` (409),
  `upload.not_found` (404), `upload.expired` (410).

## 3. Server — conversations (`src/modules/conversations`)

### S9. Attachments on messages

Schema (conversations):

```prisma
model MessageAttachment {
  id          String  @id @default(ulid())
  messageId   String  @map("message_id")
  roomId      String  @map("room_id")        // denormalised for the Files view
  blobId      String  @map("blob_id")
  filename    String                         // sanitised original name (NFC, no path, ≤ 255)
  contentType String  @map("content_type")   // sniffed, copied from the blob
  sizeBytes   BigInt  @map("size_bytes")
  position    Int
  uploaderId  String  @map("uploader_id")    // who attached it (may differ from Blob.uploaderId)
  createdAt   temporal.createdAtString() @map("created_at")
  @@index([messageId])
  @@index([roomId, createdAt])
}
```

- Capability `room.attach` is added to `CAPABILITIES` and to the defaults of
  `space_admin`, `room_admin`, `moderator` and `member` (not `reader`).
  Attaching requires **both** `room.post` and `room.attach`, so an existing
  `room.post` deny still blocks files.
- `POST /rooms/:id/messages`: `body` becomes optional
  (`z.string().min(1).optional()`), plus `attachments?: uploadId[]` (max
  `attachments.max_per_message`, runtime, default 10) and
  `linkPreviewUrl?: string` (S10). There must be a body or at least one attachment
  (`message.empty`, 422). Each upload must belong to the caller, be `ready` and not
  expired (`upload.not_ready` 409, `upload.not_found` 404). In the send
  transaction: one `MessageAttachment` per upload, in the given order. The upload's
  blob reference moves to the attachment (no net `retain` / `release`), and the
  `Upload` row is deleted.
- `PATCH /rooms/:id/messages/:messageId`: `body?`,
  `attachments?: { add?: uploadId[], remove?: attachmentId[] }`,
  `linkPreviewUrl?: string | null`. Adding requires the caller to be the author and
  to hold `room.attach` (quota and files belong to the author), within the existing
  `messages.edit_window`. Removing follows the edit rule (`edit_own` / `edit_any`).
  The message must still have a body or an attachment after the edit. Emits the
  existing `message_edited` (F8).
- `DELETE /rooms/:id/messages/:messageId/attachments/:attachmentId`: removal
  by the author (`room.delete_own`) or by moderation (`room.delete_any`, audited
  through `ModerationService` like a message deletion). Emits a new
  `attachment_removed { messageId, attachmentId }` event (additive to
  `RoomEventType`), which the client handles like `message_edited` (refetch).
- `redactMessage` (user deletion and retention delete mode) deletes the
  message's attachments and link preview and releases their blobs, in its
  existing transaction. Retention hide mode does not touch attachments (see S6
  for access).
- `MessageView` and `message_created` gain `attachments: AttachmentView[]`
  (`{ id, filename, contentType, sizeBytes, width, height, durationMs, hasThumbnail }`)
  and `linkPreview: LinkPreviewView | null`. The history page loads attachments in
  one query per page, like `mentionsForMany`.
- `GET /rooms/:id/files?kind=media|documents&before=<attachmentId>&limit=`
  (`room.read`): the room's attachments, newest first, `{ items, nextCursor }`,
  excluding hidden and redacted messages. `media` = `image/*`, `video/*`,
  `audio/*`; `documents` = everything else. Items add `messageId`, `uploaderId`
  and `createdAt`.
- Access policy for S6: `AttachmentAccessPolicy` is registered by conversations in
  a `FileAccessRegistry` (core/storage, same pattern as `BlobAccessRegistry`),
  keyed by `FileRef.kind`.

### S10. Link previews (requested by the composer, fetched by the server)

- Option `link_previews.enabled` (runtime, default `false`: an outbound fetcher
  is opt-in for the owner). When it is off, the endpoint returns
  `404 link_preview.disabled` and `linkPreviewUrl` is ignored.
- `POST /link-previews { url }` (authenticated, throttled per user with the
  `auth.sensitive_throttle` mechanism, own key `link_previews.throttle`) →
  `LinkPreviewView { id, url, title, description, siteName, hasImage }`, or `204`
  when the page has nothing to preview. The composer calls it while the user types,
  on the selected link.
- Cache `LinkPreview { id, url (normalised, unique), title, description,
  siteName, imageBlobId, status, fetchedAt }`, TTL `link_previews.cache_ttl`
  (runtime, `24h`); a failure is cached too (`status = failed`, 1 h), so a site
  is not hammered.
- Fetcher (`core/net/safe-fetch.ts`): `http` / `https` only; DNS resolved first
  and every address must be public (loopback, private, link-local, CGNAT,
  multicast, ULA and the metadata address are refused); the connection is pinned
  to the checked IP; redirects re-checked (max 3); 5 s timeout; `text/html` only;
  body cut at 1 MiB; no cookies; a fixed `User-Agent` naming the server. Parsing:
  `og:*`, `twitter:*`, `<title>`, `<meta name=description>` with a streaming
  HTML parser (`htmlparser2`, version checked when implementing; not Bun's
  `HTMLRewriter`, F12). The preview image goes through the same fetcher (image
  types only, max 5 MiB). It is ingested as a blob with no uploader and
  thumbnailed if ffmpeg is present. Readers only ever download it from our server.
- On send / edit, `linkPreviewUrl` must be one of the `http(s)` links in the
  body (`link_preview.url_not_in_body`, 422). The server copies the cached preview
  into `MessageLinkPreview { messageId PK, url, title, description, siteName,
  imageBlobId }` (a snapshot, so a later cache refresh does not change an old
  message) and retains the image blob. If the cache entry is missing (expired), it
  fetches it synchronously once. `linkPreviewUrl: null` on edit removes the
  preview after sending (overview decision). Omitting it on send = no preview.
- The "first link by default, switchable" choice is client-side: the server
  stores whichever link the author chose.

Alternatives not retained: fetching after sending in a worker (the author would
not see or choose the preview before sending); fetching by each reader (exposes
their IP, and CORS blocks it in a browser).

## 4. Server — administration (owner only, `OwnerGuard`)

### S11. Admin endpoints

- **Generic settings** (`core/config/settings.controller.ts`, overview discussion
  choice): `GET /admin/settings` → every parameter's `describe()` (key, kind,
  effective value with secrets masked, source, env lock, `hotReloadable`, schema
  hint). `PUT /admin/settings/:key { value }` → validated by the registry schema;
  `409 config.not_runtime` for an `infra` key, `409 config.locked` when env locks
  it. `DELETE /admin/settings/:key` → back to the file or default. Each change is
  audited (`config.setting_changed`, old and new value, secrets masked). The admin
  screen in this feature shows only the sharing keys; the API is reusable.
- **Per-user quota**: `GET /admin/users/:id/storage` →
  `{ usedBytes, pendingBytes, quotaBytes, overridden }`;
  `PUT /admin/users/:id/storage-quota { quotaBytes: string | null }` (null =
  unlimited); `DELETE` → back to the default. Audited.
- **Storage dashboard**: `GET /admin/storage` → `{ usedBytes, capacityBytes,
  blobCount, pendingUploads, topConsumers: [{ userId, identifier, usedBytes }]
  (10), driver, mediaTools: { available, ffmpegVersion } }`.
- **File moderation**: `GET /admin/attachments?q=&uploaderId=&roomId=&type=&before=`
  (filename search, newest first) → items with room, message and uploader.
  `DELETE /admin/blobs/:id` removes **every** reference to that content (all
  attachments, link previews and avatars using it), emits `attachment_removed` in
  each room concerned, releases the references and lets GC delete the bytes. It is
  audited (`storage.content_removed`, with the hash). Illegal content is identical
  everywhere, so removing it by content is the useful action. The admin can open
  a file through `POST /files/urls` (an owner passes every access policy).
- The cross-module part (removing an attachment from core) goes through a
  `BlobReferenceRemover` provider interface in core, which conversations and
  identity implement, so there is no feature-to-feature import (F14).

Not in scope: a hash blocklist that prevents re-uploading removed content, and
antivirus scanning (listed in section 9).

## 5. SDK (`packages/sdk`)

- **SDK1 — `client.uploads`**: `upload(file: Blob | File, { onProgress?, signal?, chunkSize? = 5 MiB })`
  → `UploadHandle { id, promise: Promise<UploadResult> }`. The tus client is
  written in-house on the existing `fetch` transport: `POST`, then chunked
  `PATCH`es. After a network error it does `HEAD`, then continues from the
  offset (3 retries, backoff). `onProgress(sent, total)` fires after each chunk.
  `resume(id, file)` and `cancel(id)` (`DELETE`). A final `PATCH` that fails
  validation throws the matching `EkozError` (`upload.type_rejected`, …).
  Alternative not retained: `tus-js-client` (an extra dependency, its own
  transport outside the SDK's token refresh).
- **`client.messages`**: `send` accepts `body?`, `attachments?`, `linkPreviewUrl?`;
  `edit` accepts the new edit shape; `removeAttachment(roomId, messageId, attachmentId)`.
- **`client.files`**: `urls(refs)`; `roomFiles(roomId, { kind, before, limit })`;
  and `SignedUrlCache`, a small helper that batches requests within a tick and
  refreshes 60 s before `expiresAt` (a `request` counter lets tests check that
  a burst of requests is batched).
- **`client.linkPreviews.fetch(url)`**, **`client.me.storage()`**.
- **`client.admin`**: `settings.list/set/reset`, `storage()`,
  `users.storage(id)`, `users.setStorageQuota(id, bytes | null)`,
  `users.resetStorageQuota(id)`, `attachments.search(query)`, `blobs.remove(id)`.
- Generated types from the new DTOs (`openapi:emit` → `generate` → `wire.ts`).
  `tus` headers are not described by OpenAPI; the `/uploads` routes are
  documented by hand in the protocol page and excluded from generated bindings.
- Changeset `minor` for `@ekozhq/sdk`.

## 6. Web client (`apps/client-web`)

- **Composer** ([composer.tsx](../../../../apps/client-web/src/features/chat/components/composer.tsx)):
  an attach button (file picker), drag and drop on the chat view, and pasting
  images. An **attachment tray** above the textarea: one chip per file with name,
  size, progress bar, cancel, error. Send is enabled when there is text or at
  least one `ready` upload and no upload still in progress. It is hidden when the
  user lacks `room.attach` (read from the existing `GET /rooms/:id/permissions`
  data). Client-side pre-checks (size, count) for immediate feedback; the server
  stays authoritative.
- **Link preview card**: when the server option is on (exposed in the auth
  policy / bootstrap payload, `linkPreviews: boolean`), the first `http(s)` link
  of the text is previewed (debounced 500 ms). The card has a **"next link"**
  button to cycle through the body's links, plus a dismiss button (overview
  decisions). The chosen URL is sent as `linkPreviewUrl`.
- **Optimistic send** (F13): the pending entry carries the ready upload ids and
  local previews (object URLs of the local files); retrying reuses them while the
  uploads are not expired.
- **Rendering** (`message-item.tsx`): an image and video grid (thumbnail when
  `hasThumbnail`, original otherwise, sized from `width` / `height` to avoid
  layout shift), a lightbox on click, native `<video controls>` / `<audio controls>`
  on signed URLs, and a file card (icon by family, name, size, download) for the
  rest. Signed URLs come from a `useFileUrl(ref)` hook on top of
  `SignedUrlCache`. The link preview card is shown under the body, with a remove
  button for the author.
- **Editing**: add or remove attachments and change or remove the preview in
  the edit mode that [web client message actions](../web-client-message-actions/overview.md)
  provides (dependency). Until it exists, only the dedicated "remove file" action
  is available.
- **Files panel**: a "Files" entry in the room header opens a side panel with
  "Media" (grid) and "Documents" (list) tabs, infinite scroll on
  `roomFiles`, and a click jumps to the message.
- **Account**: a "Storage" section in the account page (next to the existing
  sections) with a usage bar (`used / quota`, or "unlimited"). Upload refusals
  show dedicated messages (`upload.quota_exceeded` with the figures,
  `upload.too_large` with the limit, `upload.type_rejected`,
  `upload.capacity_exceeded`).
- i18n: `chat.attachments.*`, `chat.linkPreview.*`, `rooms.files.*`,
  `account.storage.*`, in French and English.

## 7. Admin console (`apps/admin`)

New routes (TanStack Router file routes, nav registry entries):

- `/settings/sharing`: a form over `/admin/settings` for `uploads.*`,
  `attachments.max_per_message`, `storage.capacity_bytes`, `link_previews.*`,
  `files.url_ttl`. It shows source and env lock per field (read-only when locked),
  byte fields with unit input (MB / GB), and "reset to default".
- `/storage`: the dashboard (global usage against capacity, top consumers
  linking to the user page, driver, ffmpeg status with the install hint when
  missing).
- `/files`: moderation search (filename, uploader, room, type) and "remove
  everywhere" with a confirmation dialog stating the number of references.
- `/users/$userId`: a "Storage" card (usage, quota, override editor: default /
  custom / unlimited).

## 8. Documentation

- Protocol: a new `docs/protocol/files-and-sharing.md` (uploads/tus, files
  URLs, room files, link previews, `me/storage`, error codes); update
  `messages-and-interactions.md` (message shape, send and edit, `attachment_removed`),
  `rooms-and-permissions.md` (`room.attach`), `identity.md` (`/admin/settings`,
  admin storage routes), and `CHANGELOG.md`.
- Technical (`docs/technical/`): update `file-storage-and-quotas.md` (query-based
  accounting, uploader, GC clock, S3); new `resumable-uploads.md`,
  `signed-file-urls.md`, `media-thumbnails.md`, `link-previews.md` (the SSRF
  policy), `admin-settings-api.md`; update `README.md` index.
- Operator docs: ffmpeg is optional (what is lost without it), and the S3
  configuration.

## 9. Consequences verified against the code

- **Migrations**: `blob.size_bytes` `int4 → int8` (in place, no data loss),
  new columns backfilled (S1). New tables `upload`, `storage_quota_override`,
  `message_attachment`, `message_link_preview`, `link_preview`. New `RoomEventType`
  value `attachment_removed` and `UploadState` enum (additive).
- **Protocol compatibility**: every change is additive except `body` becoming
  optional in `POST /rooms/:id/messages`, which widens the input. A message
  without a body now exists: clients must not assume `body !== ''` means "not
  deleted"; `redactedAt` stays the deletion marker. The web client's
  [timeline.ts](../../../../apps/client-web/src/features/chat/lib/timeline.ts)
  is checked for that.
- **Avatar path**: now charged against the quota. An avatar upload by a user
  already over quota is refused with `upload.quota_exceeded` (new error on
  `PUT /me/avatar`).
- **Blob GC**: semantics change from "created more than grace ago" to "untouched
  for more than grace". Existing tests of `blob-gc.service` are updated.
- **Boot**: without ffmpeg, only a warning; with `storage.driver = "s3"`, boot no
  longer throws.
- **Tests**: unit tests (sniffing, filter matching, token signing and expiry,
  quota arithmetic, SSRF address classification, tus header parsing, SDK tus
  client with the fetch mock); integration tests (tus flow including resume and
  expiry, quota races, send and edit with attachments, redact and retention
  releasing blobs, access re-check after leaving a room, hidden message access,
  admin routes, S3 driver on MinIO, link preview against a local HTTP fixture
  with SSRF protection bypassed only in that test); web tests (composer tray,
  preview card cycling, message rendering, files panel, account storage); admin
  route tests.
- **Out of scope**: hash blocklist, antivirus, federation file access (see
  [federation](../../../features/federation/overview.md)), room avatars (`Room.avatarBlobId`
  exists but has no consumer), resumable uploads across a page reload in the
  web client (the SDK allows it via `resume`; the demo client does not persist
  drafts).

## Implementation task breakdown

GitHub issues, label `feature:content-and-sharing`, in creation (dependency) order.

| Issue | Task | Section | Depends on |
|---|---|---|---|
| [#136](https://github.com/marmotz/ekoz/issues/136) | Storage core: blob uploader, GC fix, content type sniffing and filtering | S1, S2, S5 | - |
| [#137](https://github.com/marmotz/ekoz/issues/137) | Storage core: S3-compatible storage driver | S3 | - |
| [#138](https://github.com/marmotz/ekoz/issues/138) | Storage core: per-user quota, global capacity and `GET /me/storage` | S8 | #136 |
| [#139](https://github.com/marmotz/ekoz/issues/139) | Storage core: resumable uploads (tus 1.0) | S4 | #136, #138 |
| [#140](https://github.com/marmotz/ekoz/issues/140) | Storage core: optional ffmpeg thumbnails and media metadata | S7 | #139 |
| [#141](https://github.com/marmotz/ekoz/issues/141) | Storage core: signed file URLs with per-request access check | S6 | #136, #137 |
| [#143](https://github.com/marmotz/ekoz/issues/143) | Conversations: `room.attach` and message attachments | S9 | #139, #141 |
| [#144](https://github.com/marmotz/ekoz/issues/144) | Link previews: SSRF-safe fetcher, cache, endpoint, message snapshot | S10 | #140, #143 |
| [#145](https://github.com/marmotz/ekoz/issues/145) | Admin settings API | S11 | - |
| [#146](https://github.com/marmotz/ekoz/issues/146) | Admin storage endpoints: quota, dashboard, file moderation | S11 | #138, #140, #144 |
| [#147](https://github.com/marmotz/ekoz/issues/147) | SDK: resumable upload client and `me.storage()` | 5 | #138, #139 |
| [#148](https://github.com/marmotz/ekoz/issues/148) | SDK: attachments, file URLs, room files, link previews | 5 | #143, #144 |
| [#149](https://github.com/marmotz/ekoz/issues/149) | SDK: admin settings and storage bindings | 5 | #145, #146 |
| [#150](https://github.com/marmotz/ekoz/issues/150) | Web client: render attachments in messages | 6 | #148 |
| [#152](https://github.com/marmotz/ekoz/issues/152) | Web client: composer attachments | 6 | #147, #150 |
| [#153](https://github.com/marmotz/ekoz/issues/153) | Web client: link preview card | 6 | #152 |
| [#154](https://github.com/marmotz/ekoz/issues/154) | Web client: room Files panel and account storage | 6 | #147, #150 |
| [#155](https://github.com/marmotz/ekoz/issues/155) | Web client: edit attachments and preview in edit mode | 6 | #152, #153, message-actions edit mode |
| [#156](https://github.com/marmotz/ekoz/issues/156) | Admin console: sharing settings screen | 7 | #149 |
| [#157](https://github.com/marmotz/ekoz/issues/157) | Admin console: storage dashboard, file moderation, user storage card | 7 | #149 |
| [#158](https://github.com/marmotz/ekoz/issues/158) | Docs: protocol and technical pages | 8 | #137, #145, #146, #147, #148 |
