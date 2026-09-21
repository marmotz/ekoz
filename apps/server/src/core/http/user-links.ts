/**
 * Pure builders for the user-facing links and identifiers the server emits.
 * They live in `core` so any feature module (identity, conversations) builds
 * them the same way without importing another feature.
 */

/**
 * URL of a user's avatar, versioned by the avatar blob id. `BlobService`
 * deduplicates by content, so the blob id changes exactly when the avatar
 * content does; the avatar route ignores the `v` query and its long-lived cache
 * stays correct because the URL changes with the content.
 */
export function avatarUrl(apiUrl: string, name: string, blobId: string): string {
  return `${apiUrl}/users/${encodeURIComponent(name)}/avatar?v=${encodeURIComponent(blobId)}`;
}

/** Canonical `name/server` identifier of a user. */
export function userIdentifier(name: string, serverDomain: string): string {
  return `${name}/${serverDomain}`;
}
