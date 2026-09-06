import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { IdentifierInvalidError, IdentifierUnavailableError } from '../identity.errors.js';
import { IdentifierService } from './identifier.service.js';

function makeService(reserved: string[] = []): IdentifierService {
  const config = {
    get: (key: string) => (key === 'identity.reserved_usernames' ? reserved : undefined),
  } as unknown as ConfigService;

  return new IdentifierService(config, {} as unknown as PrismaService);
}

describe('IdentifierService (unit)', () => {
  const service = makeService();

  it('normalises trim / NFC / case', () => {
    expect(service.normalize('  Alice \n')).toBe('alice');
    expect(service.normalize('CafÉ'.normalize('NFD'))).toBe('café');
  });

  it.each(['alice', 'a', 'a1', 'a.b-c_d', '0ab', 'user.name'])('accepts %s', (name) => {
    expect(service.validate(name)).toBe(name);
  });

  it.each(['', '_alice', 'alice_', '.alice', 'alice.', 'a b', 'ALICE!', 'a'.repeat(65), 'aliçe'])(
    'rejects %s',
    (name) => {
      expect(() => service.validate(name)).toThrow(IdentifierInvalidError);
    },
  );

  it('rejects a reserved name (case / space insensitive)', () => {
    const reserved = makeService(['Admin', ' support ']);
    expect(() => reserved.validate('admin')).toThrow(IdentifierUnavailableError);
    expect(() => reserved.validate('support')).toThrow(IdentifierUnavailableError);
  });
});
