# server — identity: profile and avatar

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#19](https://github.com/ekoz-chat/server/issues/19)

Reference: [../features/identity-and-profiles/technical.md §13](../features/identity-and-profiles/technical.md#13-profile-and-avatar),
[ADR 0011](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0011-file-storage-and-quotas.md).

## To do

1. `GET /me` (account + profile + `{ isOwner, emailVerified, status }`).
2. `GET /users/:identifier` — public profile `{ identifier, displayName, bio, avatarUrl }`.
3. `PATCH /me/profile` `{ displayName?, bio? }` (`bio` ≤ `profile.bio_max_length`).
4. `PUT /me/avatar` (multipart): size check (`avatar.max_size_bytes`), real-type
   sniff with `file-type` against `avatar.allowed_mime`,
   `BlobService.ingest` + `retain` new + `release` old in one transaction.
5. `DELETE /me/avatar`.
6. `GET /users/:identifier/avatar` — streams the blob via server-core
   `GET /blobs/:id` (auth), `ETag = blob.hash`, long cache, `404` if none.
   Implement the blob access-policy hook for avatars.

## Dependencies

- [12-identity-user-model-and-identifier](12-identity-user-model-and-identifier.md)
- server-core [#9 object storage](9-object-storage.md)
