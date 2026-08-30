import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';

describe('SecretBox (unit)', () => {
  const key = randomBytes(32);

  it('round-trips a payload', () => {
    const box = new SecretBox(key);
    const plaintext = Buffer.from('super-secret-private-key');
    const sealed = box.seal(plaintext);

    expect(sealed.equals(plaintext)).toBe(false);
    expect(box.open(sealed).equals(plaintext)).toBe(true);
  });

  it('produces a different blob every time (random nonce)', () => {
    const box = new SecretBox(key);
    const a = box.seal(Buffer.from('x'));
    const b = box.seal(Buffer.from('x'));
    expect(a.equals(b)).toBe(false);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => new SecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });

  it('fails to open with the wrong key', () => {
    const sealed = new SecretBox(key).seal(Buffer.from('data'));
    expect(() => new SecretBox(randomBytes(32)).open(sealed)).toThrow();
  });

  it('fails to open a tampered blob (GCM auth tag)', () => {
    const box = new SecretBox(key);
    const sealed = box.seal(Buffer.from('data'));
    sealed[sealed.length - 1]! ^= 0x01;
    expect(() => box.open(sealed)).toThrow();
  });

  it('builds from a base64 key', () => {
    const box = SecretBox.fromBase64(key.toString('base64'));
    const sealed = box.seal(Buffer.from('hi'));
    expect(box.open(sealed).toString()).toBe('hi');
  });
});
