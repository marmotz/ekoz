import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashing helpers shared across features (technical.md §4, item 6).
 *
 * SHA-256 is the one-way function for opaque tokens: the server stores
 * `sha256Hex(token)` and never the token itself (setup token, refresh tokens,
 * invitation tokens, ...).
 */

/** Raw SHA-256 digest of `input`. */
export function sha256(input: string | Uint8Array): Buffer {
  return createHash('sha256')
    .update(typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input))
    .digest();
}

/** Lower-case hex SHA-256 digest of `input` — the form stored in token columns. */
export function sha256Hex(input: string | Uint8Array): string {
  return sha256(input).toString('hex');
}

/**
 * Constant-time comparison of two hex digests. Use when checking a presented
 * token's hash against a stored one, to avoid leaking a match through timing.
 */
export function hashesEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');

  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
