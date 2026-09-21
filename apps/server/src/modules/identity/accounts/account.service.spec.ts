import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { AccountService } from './account.service.js';
import type { IdentifierService } from './identifier.service.js';
import type { PasswordService } from './password.service.js';

interface VerificationRow {
  email: string;
  expiresAt: string;
}

/**
 * The service's own `consumedAt IS NULL` filter is applied by the database;
 * these rows are the unconsumed ones it would return.
 */
function makeService(userEmail: string | null, unconsumed: VerificationRow[]): AccountService {
  const prisma = {
    orm: {
      public: {
        User: { first: async () => ({ id: 'u1', email: userEmail }) },
        EmailVerification: {
          where: () => ({ where: () => ({ all: async () => unconsumed }) }),
        },
      },
    },
  };

  return new AccountService(
    prisma as unknown as PrismaService,
    {} as unknown as ConfigService,
    {} as unknown as IdentifierService,
    {} as unknown as PasswordService,
  );
}

const inOneHour = () => new Date(Date.now() + 3600_000).toISOString();
const anHourAgo = () => new Date(Date.now() - 3600_000).toISOString();

describe('AccountService.pendingEmailOf (unit)', () => {
  it('returns the address of a pending, unexpired email change', async () => {
    const service = makeService('old@example.com', [
      { email: 'new@example.com', expiresAt: inOneHour() },
    ]);

    expect(await service.pendingEmailOf('u1')).toBe('new@example.com');
  });

  it('ignores an expired request', async () => {
    const service = makeService('old@example.com', [
      { email: 'new@example.com', expiresAt: anHourAgo() },
    ]);

    expect(await service.pendingEmailOf('u1')).toBeNull();
  });

  it('ignores the initial verification row (same address as the account)', async () => {
    const service = makeService('alice@example.com', [
      { email: 'alice@example.com', expiresAt: inOneHour() },
    ]);

    expect(await service.pendingEmailOf('u1')).toBeNull();
  });

  it('returns null when nothing is pending', async () => {
    expect(await makeService('alice@example.com', []).pendingEmailOf('u1')).toBeNull();
  });
});
