# Media thumbnails and metadata

## Context

Image and video attachments benefit from a small preview (grid thumbnails, a
lightbox placeholder) and from knowing their dimensions/duration ahead of
render, to avoid layout shift. Generating these needs a real media toolchain;
the server otherwise has no native image/video processing dependency.

## Decision

**ffmpeg/ffprobe as optional external binaries**, detected at boot, never
required to run the server.

- `MediaToolsService.onModuleInit`
  ([media-tools.service.ts](../../apps/server/src/core/storage/media-tools.service.ts))
  runs `<media.ffmpeg_path> -version` and `<media.ffprobe_path> -version`
  (infra parameters, defaults `ffmpeg` / `ffprobe` — resolved via `PATH` unless
  the operator points them at an explicit binary). If either is missing or
  fails to run: **one warning log line**
  (`Thumbnails disabled: ffmpeg/ffprobe not found`), `available` is reported
  `false`, and boot proceeds normally — nothing downstream throws for their
  absence. The status is surfaced in the boot summary (see
  [boot configuration summary](boot-config-summary.md)) and in
  `GET /admin/storage` (`mediaTools: { available, ffmpegVersion }`), so an
  operator sees the gap without digging through logs.
- **When available**, on upload finalization
  ([upload.service.ts](../../apps/server/src/core/storage/upload.service.ts) →
  `MediaAnnotationService.annotate`,
  [media-annotation.service.ts](../../apps/server/src/core/storage/media-annotation.service.ts)),
  for `image/*` (except `image/svg+xml`, which has no useful raster frame) and
  `video/*` only:
  - `ffprobe -show_streams` → `width`, `height`, `durationMs`
    ([media-probe.ts](../../apps/server/src/core/storage/media-probe.ts)).
  - `ffmpeg` extracts one JPEG frame (seek to 1 s for a video, clamped to the
    clip's own duration; no seek for an image), scaled to at most 480 px on the
    longer side, never upscaled. The frame is ingested as its own blob with
    `uploaderId: null` (never charged against a quota — see
    [file storage and quotas](file-storage-and-quotas.md)) and recorded as
    `Blob.thumbnailBlobId` on the parent.
  - Metadata and thumbnail are attached to the **blob**, not the upload or the
    attachment: a deduplicated file (same hash uploaded again, or attached by
    a second user) never recomputes them —
    `MediaAnnotationService.annotate` short-circuits when the blob already
    carries `width`/`durationMs`/`thumbnailBlobId`.
- **Safety**: arguments are always passed as an array, never through a shell;
  `-protocol_whitelist file` on both commands, so a maliciously crafted input
  file cannot make `ffprobe`/`ffmpeg` fetch a remote URL; a 15-second timeout
  with `SIGKILL`; and any failure along the way (missing tool, bad input,
  timeout, non-zero exit) is caught and logged as a warning — it never fails
  the upload. `probeMediaDimensions` and `generateThumbnail` both return a
  "nothing" result (`null`s / `false`) rather than throwing, so the caller's
  try/catch is a second layer, not the only one.
- The `PATCH` request that finalizes an upload does this work **synchronously**
  before responding (see [resumable uploads](resumable-uploads.md)): a single
  frame extraction is short next to the time already spent uploading up to
  25 MiB, so no separate "thumbnail ready" event or polling was judged
  necessary.

## Alternatives considered

- **`sharp`** (a native npm module) for image thumbnails at least. Rejected:
  it is a native binary dependency of its own (prebuilt per platform/arch),
  handles video not at all, and does not remove the ffmpeg dependency for
  video/audio duration — it would be a second toolchain alongside ffmpeg
  rather than a replacement for it.
- **Asynchronous generation** with a "thumbnail ready" event the client waits
  for. Rejected: the actual generation time (extracting one frame) is small
  compared to the upload itself, so the added protocol surface (an event type,
  client-side polling or subscription, a loading state in the UI) was not
  worth it for the delay it would save.
- **A dedicated thumbnailing service/queue.** Rejected as premature: there is
  no throughput problem to solve yet, and it would add an operational
  dependency (a queue, a worker process) the project otherwise avoids — see
  the project's stated goal of staying deployable with few operational
  dependencies ([README](README.md)).

## Consequences

- `Blob.width`, `Blob.height`, `Blob.durationMs`, `Blob.thumbnailBlobId` are
  nullable columns on `Blob` — `null` means "not computed" (ffmpeg unavailable,
  ineligible type, or generation failed), not "known to have no dimensions".
  Clients must treat `hasThumbnail: false` / missing `width`/`height` as
  "render without a preview", not as an error state.
- A server with no ffmpeg installed is fully functional for uploads, sharing,
  download and moderation — only thumbnails and dimension/duration display are
  absent. This is what makes ffmpeg safe to treat as optional rather than a
  hard boot dependency.

### Operator notes

Installing ffmpeg (with ffprobe, normally bundled together) is the only
requirement to enable thumbnails and media metadata; no server configuration
beyond having the binaries on `PATH` (or pointing `media.ffmpeg_path` /
`media.ffprobe_path` at their location) is needed. Without it:

- Image and video attachments render full-size only — no lightweight grid
  thumbnail, and the client cannot reserve layout space ahead of load since
  `width`/`height` stay `null`.
- Video/audio duration is not shown anywhere in the UI (`durationMs` stays
  `null`).
- Nothing else is affected: uploads, quotas, downloads, moderation and link
  previews (which reuse the same annotation path for their cached image, see
  [link previews](link-previews.md)) all work identically.

The admin console's storage dashboard shows the detected ffmpeg version, or an
install hint when `available: false`.
