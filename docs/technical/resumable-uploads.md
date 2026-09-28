# Resumable uploads

## Context

Message attachments and avatars can be up to `uploads.max_file_bytes` (default
25 MiB), sent from browsers on unreliable connections. The SDK's transport is
`fetch`-based ([HTTP API conventions](api-conventions.md)), which gives no
upload progress and no way to resume after a dropped connection mid-upload. A
plain multipart `POST` would need to restart from byte zero on any failure.

## Decision

**tus 1.0 core**, plus the `creation`, `termination` and `expiration`
extensions, under `/uploads`
([upload.controller.ts](../../apps/server/src/core/storage/upload.controller.ts)),
Bearer-authenticated with the normal `AuthGuard`. Excluded from the generated
OpenAPI document: `tus` headers are not describable by the Zod-first OpenAPI
pipeline ([OpenAPI description and SDK types](openapi-description-and-sdk-types.md)),
so `/uploads` is documented by hand in `docs/protocol/files-and-sharing.md` and
the SDK binds it directly instead of through generated types.

| Request | Effect |
|---|---|
| `OPTIONS /uploads` | Advertises `Tus-Version`, `Tus-Extension`, `Tus-Max-Size` (= `uploads.max_file_bytes`). Public, unauthenticated (capability discovery only). |
| `POST /uploads` | `Upload-Length` required (no `creation-defer-length` support — deferred length was not needed by any client). `Upload-Metadata`: `filename` (required, sanitized: NFC, no path, ≤ 255), `type` (declared, kept only for display — see [file storage and quotas](file-storage-and-quotas.md) for why the declared type is never trusted). Checked against max size, quota and global capacity **before accepting a single byte**. `201` + `Location: /uploads/:id` + `Upload-Expires`. |
| `HEAD /uploads/:id` | `Upload-Offset`, `Upload-Length`. Owner only; any other caller (including a non-existent id) gets `404`, so an upload's existence is not leaked to a non-owner. |
| `PATCH /uploads/:id` | `Content-Type: application/offset+octet-stream`, `Upload-Offset` must match the current offset (`409 upload.offset_mismatch` otherwise — this is what makes the upload resumable: after a drop, the client does `HEAD` to learn the true offset, then resumes the `PATCH` from there). The chunk is appended to the staging file. When the cumulative offset reaches `length`, the upload is finalized **synchronously** in the same request/response: content-type sniffing and filtering, blob ingest, thumbnail generation (see [media thumbnails](media-thumbnails.md)). The response carries `Upload-Offset` and an `Ekoz-Upload` JSON header/body (`{ id, state, contentType, sizeBytes, width, height, durationMs, hasThumbnail }`) or the matching error code. |
| `DELETE /uploads/:id` | Cancels: deletes the staging bytes and, if the upload had already reached `ready`, releases its blob reference. |
| `GET /uploads/:id` | Non-tus JSON view of the upload's state (`offset`, `length`, `filename`, `expiresAt`) — lets a client recover after a page reload or crash without replaying tus semantics. |

Implementation: [upload.service.ts](../../apps/server/src/core/storage/upload.service.ts)
does the streaming append and finalization;
[tus-headers.ts](../../apps/server/src/core/storage/tus-headers.ts) parses
`Upload-Metadata` and sanitizes the filename.

### Pending-upload lifecycle and TTL

An `Upload` row ([contract.prisma](../../apps/server/src/core/prisma/contract.prisma))
moves through `receiving → ready` (or `failed`), created with
`expiresAt = now + uploads.pending_ttl` (runtime, default 24 h) measured from
creation, not from the last chunk. `state = receiving` counts against the
user's quota through its declared `length` (see
[file storage and quotas](file-storage-and-quotas.md)); `state = ready` counts
through its one retained blob reference instead.

The upload holds exactly **one blob reference** from the moment it finalizes
until either it is attached to a message (the reference moves to the
`MessageAttachment` in the same transaction, so there is never a net
`retain`/`release` at that point — see the content-and-sharing
[technical design §S9](../../backlog/features/content-and-sharing/technical.md))
or it expires.

`UploadSweeperService`
([upload-sweeper.service.ts](../../apps/server/src/core/storage/upload-sweeper.service.ts))
runs every 15 minutes, the same pattern as the blob GC sweep (see
[file storage and quotas](file-storage-and-quotas.md)): it deletes every
`Upload` row past `expiresAt`, removing its staging file and, for a `ready`
upload, releasing its blob reference (which then becomes eligible for blob
GC once *its* grace period passes).

## Alternatives considered

- **A single streamed multipart request.** Simpler to implement and needs no
  extra state (`Upload` table, staging path, sweeper), but cannot resume after
  a disconnection — the whole point of choosing tus. Rejected for the same
  reason chunked `PATCH` is attractive: it is also what gives the client actual
  upload progress, something `fetch` does not expose on its own.
- **The full tus 1.0 spec**, or the `@tus/server` package. The subset actually
  needed is four verbs; a full implementation (or an external dependency) would
  bring an HTTP adapter and middleware stack of its own to reconcile with
  Nest's, `AuthGuard`, and the existing problem+json error shape
  ([HTTP API conventions](api-conventions.md)) — reuse below is a bigger win
  than the parts of the spec left out (`creation-defer-length`, `concatenation`,
  `checksum`).
- **`tus-js-client`** on the SDK side: an extra dependency with its own
  transport, outside the SDK's existing `fetch` transport and its token
  refresh logic. The SDK instead implements the client half in-house on top of
  the same `fetch` transport (`client.uploads.upload()`), retrying with `HEAD`
  + resume on a network error.

## Consequences

- New `Upload` table and `UploadState` enum (`receiving | ready | failed`),
  additive migration.
- A client that only ever streams (never resumes) still gets a working upload:
  it just never needs the `HEAD` recovery path.
- Client state is not persisted across a page reload in the reference web
  client today: the SDK supports `resume(id, file)`, but the demo client does
  not keep upload drafts across a reload — an explicit scope cut, not a
  protocol limitation.

### Operator notes

Staging is **always local to the server process's filesystem**, regardless of
the configured `StorageDriver` — an S3-backed deployment still writes
in-progress chunks to `storage.upload_staging_path` before moving the complete
file into the driver on finalization. Running more than one server instance
therefore needs either a shared volume mounted at that path on every instance,
or sticky sessions that keep a given upload's `PATCH` requests on the instance
that holds its staging file. The reference server is single-instance today (it
also keeps presence in memory), so this limitation is stated here rather than
solved; it would need addressing before horizontal scaling of `apps/server`.
