# Files and sharing

Resumable uploads, signed file downloads, link previews and the caller's own
storage usage. This page is the wire contract for the storage surface of an Ekoz server.

Attachments on messages (`Message.attachments`, `POST`/`PATCH
/rooms/:id/messages(/:messageId)`, `attachment_removed`) and inline link
previews (`Message.linkPreview`) are documented in
[Messages and interactions](messages-and-interactions.md#attachments); this
page covers the storage primitives they build on. Admin storage routes
(`/admin/settings`, `/admin/storage`, `/admin/attachments`, `/admin/blobs`,
`/admin/users/:id/storage(-quota)`) are in
[Identity and profiles](identity.md#owner-administration-admin-owner-only).

## Conventions

- Error responses are `application/problem+json` with a stable `code`, in the
  `upload.*`, `files.*` and `link_preview.*` namespaces.
- Timestamps: UTC ISO-8601. Identifiers: ULID. Byte counts (`sizeBytes`,
  `usedBytes`, `quotaBytes`, ...) are decimal **strings**, like `Room.lastSeq`.
- `POST /uploads` and its sibling `/uploads/:id` routes are excluded from the
  generated OpenAPI document (`tus` headers are not describable by OpenAPI) and
  are documented here by hand.

## Resumable uploads (tus 1.0)

`/uploads` implements the [tus 1.0.0](https://tus.io/protocols/resumable-upload)
core protocol plus the `creation`, `termination` and `expiration` extensions,
Bearer-authenticated (the normal `AuthGuard`). An in-house implementation, not
`@tus/server`.

An upload moves through the states `receiving` → `ready` (finalized and
ingested) or `failed` (rejected by the type filter, or its staging bytes lost
to expiry). It holds one blob reference from `ready` until it is attached to a
message (the reference moves to the attachment) or it expires.

### `OPTIONS /uploads`

Capability discovery. Public, no body.

- `204`. Headers: `Tus-Resumable: 1.0.0`, `Tus-Version: 1.0.0`,
  `Tus-Extension: creation,termination,expiration`, `Tus-Max-Size` (the
  server's `uploads.max_file_bytes`).

### `POST /uploads`

Start an upload. Checked against the size limit, the caller's quota and the
server's global capacity **before** a single byte is accepted.

- Headers: `Upload-Length` (required, the whole file's declared size in
  bytes), `Upload-Metadata` (tus creation extension: comma-separated
  `key base64(value)` pairs) with `filename` (required, sanitised: Unicode
  NFC-normalised, path components stripped, capped at 255 characters) and
  `type` (declared content type, informational only — never used for the
  filter or the type sniffing below).
- `201`. Headers: `Tus-Resumable: 1.0.0`, `Location: /uploads/:id`,
  `Upload-Expires` (the pending-upload TTL, `uploads.pending_ttl`, from
  creation).
- Errors: `upload.request_invalid` (`400`, missing/malformed `Upload-Length`
  or no `filename` in `Upload-Metadata`), `upload.too_large` (`413`,
  `Upload-Length` exceeds `uploads.max_file_bytes`), `upload.quota_exceeded`
  (`403`, would exceed the caller's storage quota;
  `details: { usedBytes, quotaBytes }`), `upload.capacity_exceeded` (`507`,
  would exceed the server's global storage capacity).

### `HEAD /uploads/:id`

Resumption check (tus core). Owner only.

- `200`. Headers: `Tus-Resumable: 1.0.0`, `Upload-Offset`, `Upload-Length`,
  `Cache-Control: no-store`.
- Errors: `upload.not_found` (`404`, unknown id or not the caller's — the two
  cases answer identically, so ownership is never leaked).

### `PATCH /uploads/:id`

Append a chunk (tus core). `Content-Type: application/offset+octet-stream`,
body is the raw chunk bytes.

- Headers: `Upload-Offset` (required, must equal the upload's current
  offset). Sending more bytes than the declared `Upload-Length` fails the
  request mid-stream.
- A partial chunk (offset still below `Upload-Length` after the chunk):
  `204`, header `Upload-Offset` set to the new offset.
- The chunk that completes the upload (`offset = length`): finalization runs
  **synchronously** before the response — content-type sniffing, the type
  filter, ingestion into the blob store, retaining the blob, and (for
  `image/*`/`video/*`, if ffmpeg is configured) thumbnail and media-metadata
  extraction. `200`, header `Upload-Offset` set to `length`, plus an
  `Ekoz-Upload` header carrying the same JSON body as the response:
  `{ id, state: "ready", contentType, sizeBytes, width, height, durationMs, hasThumbnail }`
  (`width`/`height`/`durationMs` are `null` when not applicable or ffmpeg is
  unavailable). A type rejected by the filter answers `422
  upload.type_rejected` instead, and the upload's state becomes `failed`.
- Errors: `upload.not_found` (`404`), `upload.expired` (`410`),
  `upload.offset_mismatch` (`409`, `Upload-Offset` missing/malformed or does
  not match the upload's current offset, including sending more bytes than
  declared), `upload.type_rejected` (`422`, on the finalizing chunk only).

### `DELETE /uploads/:id`

Cancel (tus termination extension). Deletes the staging bytes, and releases
the blob reference if the upload had already reached `ready`.

- `204`.
- Errors: `upload.not_found` (`404`), `upload.expired` (`410`).

### `GET /uploads/:id`

Non-tus JSON view of the upload's state — lets a client recover after a crash
without replaying tus semantics.

- `200`: `{ id, state, offset, length, filename, expiresAt }` (`offset` and
  `length` as decimal strings).
- Errors: `upload.not_found` (`404`).

### Pending-upload expiry

`uploads.pending_ttl` (default `24h`) bounds how long an upload may sit
`receiving` or `ready` without being attached to a message. A background
sweeper deletes expired `receiving`/`failed` uploads (and their staging
bytes) and releases the blob reference of expired `ready` ones, the same
pattern as the blob garbage collector. An
expired upload answers `upload.expired` (`410`) to every further request on
it.

## Downloads through signed URLs

Attachments, link-preview images and cached preview images are never served
directly by id — a client requests a short-lived signed URL first, so
`<img>`/`<video>`/`<audio>` can load them without carrying a Bearer token, and
access can be re-checked on every byte served.

### `POST /files/urls`

Issue up to 100 signed download URLs in one call, each after its own access
check.

- Body: `{ items: FileRef[] }` (1 to 100 items). A `FileRef` is one of:
  - `{ kind: "attachment", id, variant: "original" | "thumbnail" }` — a
    message attachment, `id` the attachment id;
  - `{ kind: "message_preview", messageId }` — a message's snapshotted
    link-preview image;
  - `{ kind: "preview", previewId }` — a link preview's cached image, before
    it is used in any message (open to any authenticated user — used by the
    composer while previewing a link before sending).
- `200`: `{ items: FileUrlResult[] }`, one result per requested item, same
  order. Each is either `{ ref, url, expiresAt }` (issued) or
  `{ ref, error }` (denied — `error` is `files.not_found`, never a different
  status per item: the batch itself always answers `200`).
- `url` TTL: `files.url_ttl` (default `1h`) — long enough to watch a video
  through several `Range` requests without reissuing the URL mid-playback.
- Errors: validation (`422`, empty or over 100 items, or a malformed ref).

### `GET /files/:token`

The actual download. Public route (no `Authorization` header — the token
itself carries the caller's identity), but **access is re-checked on every
request** against the `userId` encoded in the token, not only when the URL
was issued: a user who loses access (leaves the room, gets banned, ...)
loses the ability to use a URL they already hold, even before it expires.

- Access rules for an `attachment` ref: the caller needs `room.read` on the
  attachment's room, the message must not be redacted, and if the message is
  hidden the caller must also hold `room.delete_any` (moderation can still
  see hidden content). A `preview` ref is open to any authenticated caller
  the token names.
- Range support: a `Range: bytes=start-end` request header (single range
  only) is honoured when the storage driver supports it, answering `206`
  with `Content-Range`; an unsatisfiable range answers `416`.
- Response headers: `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: sandbox; default-src 'none'`,
  `Content-Disposition: inline` for `image/*` (except `image/svg+xml`),
  `audio/*` and `video/*`; `attachment; filename*=UTF-8''<name>` for
  everything else (including `image/svg+xml`). `ETag` is the content hash;
  `Cache-Control: private, max-age=<seconds left on the token>`.
- On the `s3` storage driver, the response is a `302` redirect to a
  60-second presigned URL instead of a streamed body (the access check still
  runs first).
- Errors: `files.not_found` (`404`, unknown/expired/tampered token, or the
  access check fails — the same answer either way, so a caller cannot tell
  which).

## Own storage usage

### `GET /me/storage`

The caller's own usage against their effective quota.

- `200`: `{ usedBytes, pendingBytes, quotaBytes }`. `usedBytes` sums the
  caller's blobs still referenced (`refCount > 0`); `pendingBytes` sums the
  declared length of the caller's uploads still `receiving`. `quotaBytes` is
  `null` when unlimited (no `StorageQuotaOverride` and
  `uploads.default_quota_bytes` itself set to unlimited, or an explicit
  unlimited override).

## Link previews

Off by default (`link_previews.enabled`, exposed as `linkPreviews` on
[`GET /auth/policy`](identity.md#get-authpolicy)). When off, every route below
answers `404 link_preview.disabled`.

### `POST /link-previews`

Fetch (or return the cached) preview metadata for a URL. Throttled per user
(`link_previews.throttle`).

- Body: `{ url }` — must be `http(s)`.
- `200`: `{ id, url, title, description, siteName, hasImage }` (`hasImage`:
  whether a preview image was captured; fetch it via `POST /files/urls` with
  `{ kind: "preview", previewId: id }`).
- `204`: the page has nothing worth previewing (no title, no description, no
  image).
- The fetch is SSRF-safe: `http`/`https` only, DNS resolved first with every
  candidate address required to be public (no loopback, private, link-local,
  CGNAT, multicast or cloud-metadata address), the connection pinned to the
  checked address, redirects re-checked, a fixed timeout, and the response
  body size-capped.
- Cache TTL: `link_previews.cache_ttl` (default `24h`); a failed fetch is
  cached too, for a shorter period, so a broken URL is not retried on every
  request.
- Errors: `link_preview.disabled` (`404`), `link_preview.url_invalid` (`422`,
  not a valid `http(s)` URL), `link_preview.too_many_requests` (`429`, with
  `Retry-After`), validation (`422`).

Sending a link preview with a message (`linkPreviewUrl` on
`POST`/`PATCH /rooms/:id/messages(/:messageId)`) snapshots the cached preview
into the message so a later cache refresh never changes an already-sent
message — see [Link previews](messages-and-interactions.md#link-previews).

## Error codes reference

| Code                            | Status | Meaning                                                          |
| -------------------------------- | ------ | ------------------------------------------------------------------ |
| `upload.request_invalid`         | 400    | Malformed `Upload-Length` or missing `filename` on `POST /uploads`. |
| `upload.too_large`               | 413    | Declared length exceeds `uploads.max_file_bytes`.                  |
| `upload.quota_exceeded`          | 403    | Would exceed the uploader's storage quota (`details: { usedBytes, quotaBytes }`). Also raised by `PUT /me/avatar`. |
| `upload.capacity_exceeded`       | 507    | Would exceed the server's global storage capacity.                 |
| `upload.type_rejected`           | 422    | The sniffed content type is blocked by `uploads.filter_mode`/`uploads.filter_types`. |
| `upload.offset_mismatch`         | 409    | `Upload-Offset` missing, malformed, or does not match the upload's current offset. |
| `upload.not_found`               | 404    | Unknown upload id, or not owned by the caller.                     |
| `upload.expired`                 | 410    | The upload's `uploads.pending_ttl` has elapsed.                    |
| `upload.not_ready`               | 409    | Referenced (e.g. as a message attachment) before reaching `ready`. |
| `files.not_found`                | 404    | Unknown/expired/tampered download token, or the access check failed. |
| `link_preview.disabled`          | 404    | `link_previews.enabled` is `false`.                                 |
| `link_preview.url_invalid`       | 422    | Not a valid `http(s)` URL.                                          |
| `link_preview.url_not_in_body`   | 422    | `linkPreviewUrl` (on send/edit) is not one of the `http(s)` links in `body`. |
| `link_preview.too_many_requests` | 429    | Throttled (`link_previews.throttle`); see `Retry-After`.            |
