import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from 'node:crypto';

/**
 * Ed25519 keypair helpers for the server signing key (technical.md §4, ADR
 * 0006). `crypto.generateKeyPair('ed25519')` is validated under Bun by the
 * stack POC.
 *
 * Wire formats:
 *   - public key  → raw 32-byte key, base64 (compact, federation-friendly);
 *   - private key → PKCS#8 DER, sealed by `SecretBox` before it touches a column.
 */

export interface GeneratedEd25519KeyPair {
  /** Raw 32-byte public key, base64. */
  publicKeyBase64: string;
  /** PKCS#8 DER private key, to be sealed before storage. */
  privateKeyDer: Buffer;
}

/** Base64url `x` coordinate of an Ed25519 public key, as Node's JWK export gives it. */
function rawPublicKeyToJwkX(publicKeyBase64: string): string {
  return Buffer.from(publicKeyBase64, 'base64').toString('base64url');
}

export function generateEd25519KeyPair(): GeneratedEd25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) {
    throw new Error('Ed25519 public key export did not yield a JWK x coordinate');
  }

  return {
    publicKeyBase64: Buffer.from(jwk.x, 'base64url').toString('base64'),
    privateKeyDer: privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer,
  };
}

/** Rebuild a private `KeyObject` from the sealed-then-opened PKCS#8 DER bytes. */
export function privateKeyFromDer(der: Uint8Array): KeyObject {
  return createPrivateKey({ key: Buffer.from(der), format: 'der', type: 'pkcs8' });
}

/** Rebuild a public `KeyObject` from the stored raw base64 key. */
export function publicKeyFromBase64(publicKeyBase64: string): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: rawPublicKeyToJwkX(publicKeyBase64) },
    format: 'jwk',
  });
}

/** Detached Ed25519 signature over `message` (the algorithm is fixed, so `algorithm` is `null`). */
export function ed25519Sign(privateKey: KeyObject, message: Uint8Array): Buffer {
  return nodeSign(null, Buffer.from(message), privateKey);
}

export function ed25519Verify(publicKey: KeyObject, message: Uint8Array, signature: Uint8Array): boolean {
  return nodeVerify(null, Buffer.from(message), publicKey, Buffer.from(signature));
}
