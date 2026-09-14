# Content and sharing

**Status**: in discussion

## Context

Conversations must allow sharing more than text, in particular files and links,
without compromising the operational simplicity of the server.

## Goal

Define file and link sharing in conversations, including their lifecycle, access
rules and retention.

## Decisions made

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
- In a private room, only the current members of the room can download a shared
  file, including when they have its link.
- Files in a public room also require authentication to be downloaded.
- The web client renders supported images, audio and video inline.
- An attachment follows the same retention rule as its message.
- The author of the share and authorised moderation roles can remove a file
  before its expiry.
- Link previews are an option the server owner can enable or disable.

## Depends on

- [Conversations](../conversations/overview.md), for sharing content in rooms.
- [Server administration](../../_archives/features/server-administration/overview.md), for storage
  limits and the link preview option.

## Feature order

- [Federation](../federation/overview.md) extends file access to authorised
  remote members.
- [Extensibility](../extensibility/overview.md) allows adding content types.
