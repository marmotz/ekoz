import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated symmetric encryption for secrets at rest (technical.md §4,
 * ADR 0006).
 *
 * AES-256-GCM under the 32-byte infra `secret.key` as the key-encryption key.
 * The sealed blob is `nonce (12 bytes) || authTag (16 bytes) || ciphertext`,
 * self-contained so a column only has to store one `bytea`.
 *
 * Rotating `secret.key` makes every previously sealed value unreadable — that is
 * the documented trade (see `config.example.toml`).
 */
export class SecretBox {
  private static readonly NONCE_BYTES = 12;
  private static readonly TAG_BYTES = 16;
  private static readonly KEY_BYTES = 32;

  private readonly key: Buffer;

  /** @param key the raw 32-byte key-encryption key (decoded from base64). */
  constructor(key: Uint8Array) {
    if (key.length !== SecretBox.KEY_BYTES) {
      throw new Error(`SecretBox key must be ${SecretBox.KEY_BYTES} bytes, got ${key.length}`);
    }

    this.key = Buffer.from(key);
  }

  /** Build a box from the base64-encoded key held by the `secret.key` parameter. */
  static fromBase64(keyBase64: string): SecretBox {
    return new SecretBox(Buffer.from(keyBase64, 'base64'));
  }

  /** Seal `plaintext`, returning `nonce || authTag || ciphertext`. */
  seal(plaintext: Uint8Array): Buffer {
    const nonce = randomBytes(SecretBox.NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);

    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  }

  /** Open a blob produced by {@link seal}. Throws if the key or the data is wrong. */
  open(sealed: Uint8Array): Buffer {
    const buffer = Buffer.from(sealed);
    const header = SecretBox.NONCE_BYTES + SecretBox.TAG_BYTES;
    if (buffer.length < header) {
      throw new Error('SecretBox: sealed blob is too short');
    }

    const nonce = buffer.subarray(0, SecretBox.NONCE_BYTES);
    const authTag = buffer.subarray(SecretBox.NONCE_BYTES, header);
    const ciphertext = buffer.subarray(header);

    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
