# Content and sharing

**Status**: todo, see [technical.md](./technical.md)

## Context

Conversations must allow sharing more than text, in particular files and links,
without compromising the operational simplicity of the server. The server
already has the blob foundation (storage driver, content-hash deduplication,
garbage collection) but only avatars use it; messages cannot carry files yet.

## Goal

Define and deliver file and link sharing in conversations, including their
lifecycle, access rules and retention, end to end: protocol, server, SDK, web
client, admin console and documentation.

## Decisions made

### Scope

- The feature covers the protocol, the server, `@ekozhq/sdk`, the web client,
  the admin console and the documentation (no separate `web-client-*` feature).

### Messages and attachments

- A message can carry several files, up to a ceiling configured by the owner.
- Uploads are resumable: an interrupted upload continues where it stopped.
- Defaults: 25 MiB per file, 1 GiB quota per user, unlimited global capacity,
  10 files per message.
- The text is optional: a message can consist of files only (the text acts as a
  caption).
- Sharing files requires a dedicated capability, `room.attach`, distinct from
  `room.post`, so a room can allow text but not files.
- Editing a message can add and remove attachments. Removing one releases its
  quota.
- A file uploaded but never sent in a message (abandoned draft) counts against
  the quota until it expires after a delay, then is removed automatically.

### Files: filtering, limits, storage

- The server owner chooses the filtering mode: "allow all except" (list of
  blocked types) or "deny all except" (list of allowed types). The type is
  determined from the actual file content, never from the extension. Default:
  "allow all except" with an empty list.
- The owner configures the maximum size per file, a per-user quota and the global
  file storage capacity. A user cannot exceed their quota without explicit
  authorisation.
- Identical files are stored physically only once (content-hash deduplication);
  the quota is charged to the original uploader and released when the file is no
  longer referenced.
- Physical storage is modular: local disk, S3-compatible service or other. See
  [file storage and quotas](../../../docs/technical/file-storage-and-quotas.md).
- Profile avatars are files handled by the same system (deduplicated blobs),
  attached to a profile rather than to a message.
- The server generates thumbnails for images and videos only when the optional
  dependencies needed for it are installed. Their presence is checked at boot;
  if missing, a non-blocking warning is logged and no thumbnail is produced.

### Access and lifecycle

- In a private room, only the current members of the room can download a shared
  file, including when they have its link.
- Files in a public room also require authentication to be downloaded.
- An attachment follows the same retention rule as its message.
- The author of the share and authorised moderation roles can remove a file
  before its expiry.

### Link previews

- Link previews are an option the server owner can enable or disable.
- The server fetches the preview (title, description, image) and caches it, so
  readers' IP addresses are never exposed to third-party sites.
- The preview is shown in the composer before sending. It uses the first link
  of the message by default; the author can switch to another link of the
  message from the preview card.
- The author can remove the preview of a link from their message, before or
  after sending.

### Web client

- Supported images, audio and video are rendered inline.
- A user sees their storage usage against their quota in their account
  settings, and gets an explicit message when an upload is refused.
- Each room has a "Files" view listing its shared files (media / documents),
  limited to what the viewer can read.

### Admin console

- Sharing settings: type filtering, max file size, default quota, global
  capacity, files per message, link preview option.
- Per-user quota: raise it or make it unlimited for a given user.
- Storage dashboard: global usage, largest consumers, thumbnail dependency
  status.
- File moderation: find and remove a file anywhere on the server.

## Depends on

- [Conversations](../../_archives/features/conversations/overview.md), for sharing content in rooms.
- [Server administration](../../_archives/features/server-administration/overview.md), for storage
  limits and the link preview option.
- [Web client message actions](../web-client-message-actions/overview.md), for
  the message edit UI that adding / removing attachments plugs into.

## Feature order

- [Federation](../federation/overview.md) extends file access to authorised
  remote members.
- [Extensibility](../extensibility/overview.md) allows adding content types.
