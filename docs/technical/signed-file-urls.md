# Signed file URLs

## Context

Attachments and link-preview images need to be loaded by `<img>`, `<video>`
and `<audio>` tags, which cannot send a custom `Authorization` header, and
`<video>`/`<audio>` need HTTP `Range` support for seeking. The SDK's existing
pattern for the avatar — fetch the bytes as a `Blob` through the authenticated
transport, then render it via an object URL — cannot stream: the whole file has
to download, and sit fully in memory, before playback starts. That is
unworkable for a video attachment.

## Decision

Short-lived, per-request signed URLs, issued by the API and re-checked on
every download — not a permanent link, and not a one-time-checked link.

- `POST /files/urls` (authenticated), body `{ items: FileRef[] }` (max 100 per
  call). A `FileRef` is `{ kind: "attachment", id, variant: "original" |
  "thumbnail" }`, `{ kind: "message_preview", messageId }`, or `{ kind:
  "preview", previewId }` — see [link previews](link-previews.md) for the last
  two. Each item is resolved independently through
  [`FileAccessRegistry`](../../apps/server/src/core/storage/file-access.registry.ts);
  the response is `{ items: [{ ref, url, expiresAt } | { ref, error }] }`, so
  one denied file does not fail the whole batch
  ([files.controller.ts](../../apps/server/src/core/storage/files.controller.ts)).
- **Token**: `base64url(kind|id|variant|userId|exp) + "." + HMAC-SHA256(...)`
  ([file-url-token.ts](../../apps/server/src/core/storage/file-url-token.ts)).
  The HMAC key is not the raw secret: it is derived from the infra `secret.key`
  with HKDF (`sha256`, label `ekoz/files-url/v1`), the same pattern used for
  other secret-derived keys — so a signed-file-URL key compromise does not
  expose `secret.key` itself, and vice versa. Verification is constant-time
  (`timingSafeEqual`) and never throws — a malformed or tampered token just
  resolves to `null`, treated as `files.not_found` by the caller.
- **TTL**: `files.url_ttl` (runtime, default `1h`) — long enough that a video
  watched with several `Range` requests over a slow connection does not need a
  fresh token mid-playback, short enough that a URL pasted somewhere else goes
  stale soon.
- **Access is re-checked on every `GET /files/:token`, not only when the URL
  is issued.** The token identifies *who* is asking (`userId`) and *what*
  (`kind`, `id`, `variant`); it does not itself grant access. On every
  download, `FileAccessRegistry.resolve(claims, claims.userId)` runs again,
  exactly the same check as at issuance time. This is a deliberate design
  choice, not an oversight: a signed URL that stayed valid for the room-read
  check performed at issuance would let a user who is later removed from a
  private room, or whose message gets moderated, keep pulling the file for up
  to an hour on a URL they already have cached or shared. Re-checking access at
  serve time means "including when they have its link" (a functional
  requirement) is actually enforced — losing access takes effect immediately,
  not after the TTL expires. The cost is one extra access-policy call per
  download instead of per issuance; access policies are cheap membership/role
  lookups, so this was judged worth it.
- **Access policies** (`FileAccessPolicy`, registered per `FileRefKind` by the
  feature that owns that kind — conversations registers `attachment` and
  `message_preview`, link previews register `preview`; core storage grants
  nothing by itself, a kind with no registered policy always denies). For an
  `attachment`: the caller needs `room.read` on the attachment's room, the
  message must not be redacted, and if the message is hidden by retention the
  caller must also hold `room.delete_any` (moderation can still see hidden
  content — see [retention and tombstones](retention-and-tombstones.md) and
  [permission model](permission-model.md)). A `preview` (the link-preview
  cache's own image) is open to any authenticated user, since it is public web
  content already fetched by the server, and reusing it across users is the
  point of caching it.
- **Serving** (`GET /files/:token`, public route — the token itself is the
  credential): the `local` driver streams the bytes directly with `Range` /
  `206` support (`Content-Range`, `Accept-Ranges: bytes`), `ETag` set to the
  blob's content hash, `Cache-Control: private, max-age=<remaining TTL>`. The
  `s3` driver instead issues a `302` redirect to a 60-second `presignGet` URL
  after the access check passes — S3 serves `Range` itself on that presigned
  URL, so the app server never proxies the bytes for that driver. See
  [file storage and quotas](file-storage-and-quotas.md#s3-compatible-driver)
  for the driver itself.
- **Response hardening**: `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: sandbox; default-src 'none'` (an uploaded file is
  never trusted to run script or navigate as if it were same-origin content),
  and `Content-Disposition: inline` only for `image/*` (except `image/svg+xml`,
  which can carry script), `audio/*`, `video/*` and `application/pdf` — every
  other type forces `attachment; filename*=UTF-8''…` so a browser never tries
  to render an arbitrary uploaded file inline.
- `GET /blobs/:id` (the older, blob-level, `BlobAccessRegistry`-gated route
  used by avatars) is unchanged: avatars keep their own route and do not move
  to the signed-URL mechanism, since an avatar has no per-request access
  variance to re-check (it is either public or it isn't, decided once at fetch
  time by the existing avatar policy).

Upload mechanics that produce the blobs served here are covered in
[resumable uploads](resumable-uploads.md); this page is only about how a
finished file is later read back.

## Alternatives considered

- **Object URL through the SDK's authenticated `fetch`** (the pre-existing
  avatar pattern). Rejected for anything beyond a small avatar: the entire
  file downloads into memory before the `<img>`/`<video>` can show anything,
  and no `Range` seeking is possible.
- **A session cookie** instead of a signed token, so `<img src>` could just
  rely on ambient credentials. Rejected: it would be a second authentication
  mechanism alongside the existing Bearer-token scheme, with CSRF exposure to
  manage for a route that otherwise has none.

## Consequences

- Every file view (message attachment grid, files panel, lightbox, link
  preview card) goes through `POST /files/urls` first, then loads the returned
  URL directly — an extra round trip compared to a permanent URL, amortized in
  the SDK by `SignedUrlCache`, which batches requests issued within one tick
  and proactively refreshes a URL 60 seconds before its `expiresAt`.
- A leaked URL is only useful as the user it was issued for, and only for as
  long as that user keeps access — not indefinitely, and not merely until the
  TTL expires.
- The `s3` driver's presigned-URL step means the app server does one extra
  access check on every download but does not proxy S3-hosted bytes — download
  bandwidth for the `s3` driver flows client-to-S3, not client-to-app-server.
