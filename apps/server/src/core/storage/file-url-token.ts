import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { InternalFileRef } from './file-ref.js';

const HKDF_LABEL = 'ekoz/files-url/v1';
const HKDF_KEY_BYTES = 32;

export interface FileUrlClaims extends InternalFileRef {
  userId: string;
  /** Unix seconds. */
  exp: number;
}

/** Derive the HMAC key for signed file URLs from the infra `secret.key` (HKDF, technical.md §S6). */
function deriveKey(secretKeyBase64: string): Buffer {
  const ikm = Buffer.from(secretKeyBase64, 'base64');
  const derived = hkdfSync('sha256', ikm, Buffer.alloc(0), HKDF_LABEL, HKDF_KEY_BYTES);

  return Buffer.from(derived);
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/**
 * Signs and verifies short-lived file-download tokens (technical.md §S6):
 * `base64url(kind|id|variant|userId|exp) + "." + HMAC-SHA256`. The signature
 * proves the claims were not tampered with; the caller still re-checks access
 * for `userId` on every request — the token only proves who is asking.
 */
export class FileUrlSigner {
  private readonly key: Buffer;

  constructor(secretKeyBase64: string) {
    this.key = deriveKey(secretKeyBase64);
  }

  sign(claims: FileUrlClaims): string {
    const payload = [claims.kind, claims.id, claims.variant, claims.userId, claims.exp].join('|');
    const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
    const signature = base64url(createHmac('sha256', this.key).update(payloadB64).digest());

    return `${payloadB64}.${signature}`;
  }

  /** Verifies the signature and expiry. Returns `null` for anything wrong — never throws. */
  verify(token: string): FileUrlClaims | null {
    const dotIndex = token.indexOf('.');
    if (dotIndex < 0) {
      return null;
    }

    const payloadB64 = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);
    const expectedSignature = base64url(createHmac('sha256', this.key).update(payloadB64).digest());

    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    let payload: string;
    try {
      payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    } catch {
      return null;
    }

    const parts = payload.split('|');
    if (parts.length !== 5) {
      return null;
    }
    const [kind, id, variant, userId, expRaw] = parts;
    const exp = Number(expRaw);
    if (!kind || !id || !userId || !Number.isFinite(exp)) {
      return null;
    }
    if (exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { kind: kind as InternalFileRef['kind'], id, variant: variant ?? '', userId, exp };
  }
}
