import { describe, expect, it } from 'vitest';
import { hashesEqual, sha256Hex } from './hashing.js';

describe('hashing helpers (unit)', () => {
  it('computes a stable lower-case hex SHA-256', () => {
    // Known vector: SHA-256("abc").
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes strings and bytes identically', () => {
    expect(sha256Hex('token')).toBe(sha256Hex(Buffer.from('token', 'utf8')));
  });

  it('compares digests in constant time', () => {
    const a = sha256Hex('secret-token');
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, sha256Hex('other'))).toBe(false);
    expect(hashesEqual(a, 'deadbeef')).toBe(false);
  });
});
