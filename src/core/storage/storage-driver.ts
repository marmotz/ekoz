/**
 * Object storage driver contract (technical.md §6, ADR 0011).
 *
 * The driver only moves bytes at a key; deduplication, reference counting and
 * access control live in {@link BlobService} and the referencing features. Keys
 * are content-addressed (`blobs/<hash[0:2]>/<hash>`), so a `put` for a key that
 * already exists is idempotent.
 */
export interface StorageDriver {
  /** Write `body` at `key`, overwriting any existing object. */
  put(key: string, body: NodeJS.ReadableStream, contentType: string): Promise<void>;
  /** Open `key` for reading. Rejects if the key is absent. */
  get(key: string): Promise<NodeJS.ReadableStream>;
  /** Remove `key`. A missing key is not an error. */
  delete(key: string): Promise<void>;
  /**
   * A time-limited direct URL for `key`, or `null` when the driver cannot issue
   * one (the `local` driver always returns `null`; downloads are proxied through
   * the API for access control).
   */
  presignGet?(key: string, ttlSeconds: number): Promise<string | null>;
  /** Best-effort check that the backing store accepts writes (readiness probe). */
  healthCheck(): Promise<void>;
}

/** DI token for the configured {@link StorageDriver}. */
export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Content-addressed storage key for a blob hash (technical.md §6). */
export function blobStorageKey(hash: string): string {
  return `blobs/${hash.slice(0, 2)}/${hash}`;
}
