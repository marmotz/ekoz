import { describe, expect, it } from 'vitest';
import { WeakPasswordError } from '../identity.errors.js';
import { PasswordService } from './password.service.js';

describe('PasswordService (unit)', () => {
  const service = new PasswordService();

  it('hashes with the Argon2id policy and verifies round-trip', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await service.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await service.verify(hash, 'wrong')).toBe(false);
  });

  it('never throws on a malformed stored hash', async () => {
    expect(await service.verify('not-a-hash', 'x')).toBe(false);
  });

  it('flags a hash produced under a weaker policy', () => {
    expect(service.needsRehash('$argon2id$v=19$m=4096,t=2,p=1$abc$def')).toBe(true);
    expect(service.needsRehash('$argon2i$v=19$m=19456,t=2,p=1$abc$def')).toBe(true);
    expect(service.needsRehash('$argon2id$v=19$m=19456,t=2,p=1$abc$def')).toBe(false);
  });

  it('dummyVerify resolves without throwing', async () => {
    await expect(service.dummyVerify()).resolves.toBeUndefined();
  });

  describe('assertAcceptable', () => {
    it('accepts a password that clears the length floor and is not common', () => {
      expect(() => service.assertAcceptable('a-decent-passphrase')).not.toThrow();
    });

    it('rejects a password shorter than 10 characters', () => {
      expect(() => service.assertAcceptable('short1')).toThrow(WeakPasswordError);
    });

    it('rejects a common password regardless of case', () => {
      expect(() => service.assertAcceptable('Password123')).toThrow(WeakPasswordError);
    });
  });
});
