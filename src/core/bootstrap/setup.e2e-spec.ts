import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { expectAuditEntry } from '../audit/testing/audit-assertions.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { NoOwnerLookup } from './owner-lookup.js';
import { SetupService } from './setup.service.js';

describe('SetupService (integration)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let audit: AuditService;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = { orm: database.db.orm } as unknown as PrismaService;
    audit = new AuditService(prisma);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('applies the migration: the setup_token table is queryable', async () => {
    expect(await database.db.orm.public.SetupToken.all()).toEqual([]);
  });

  it('token-pinned: rotates to a fresh single unconsumed token on every restart', async () => {
    const service = new SetupService(prisma, audit, new NoOwnerLookup(), {});

    await service.ensureSetupToken();
    const first = (await database.db.orm.public.SetupToken.all()) as Array<{ id: string; tokenHash: string }>;
    await service.ensureSetupToken();
    const second = (await database.db.orm.public.SetupToken.all()) as Array<{
      id: string;
      tokenHash: string;
      consumedAt: string | null;
    }>;

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]!.id).not.toBe(first[0]!.id);
    expect(second[0]!.consumedAt).toBeNull();
  });

  it('completeSetup consumes the token and writes server.initialized', async () => {
    const service = new SetupService(prisma, audit, new NoOwnerLookup(), {});
    await service.ensureSetupToken();

    await service.completeSetup({ ownerUserId: 'user-owner', ownerEmail: 'owner@ekoz.example.com' });

    const rows = (await database.db.orm.public.SetupToken.all()) as Array<{ consumedAt: string | null }>;
    expect(rows.every((r) => r.consumedAt !== null)).toBe(true);
    await expectAuditEntry({ orm: database.db.orm }, 'server.initialized', { actorUserId: 'user-owner' });
  });

  it('stays open with the default NoOwnerLookup', async () => {
    const service = new SetupService(prisma, audit, new NoOwnerLookup(), {});
    await expect(service.assertOpen()).resolves.toBeUndefined();
  });
});
