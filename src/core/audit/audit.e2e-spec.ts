import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWithRequestContext } from '../http/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { AuditService } from './audit.service.js';
import { expectAuditEntry, expectNoAuditEntry } from './testing/audit-assertions.js';

describe('AuditService (integration)', () => {
  let database: TestDatabase;
  let service: AuditService;

  beforeAll(async () => {
    database = await startTestDatabase();
    service = new AuditService({ orm: database.db.orm } as unknown as PrismaService);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('applies the migration: the audit_log table is queryable', async () => {
    expect(await database.db.orm.public.AuditLog.all()).toEqual([]);
  });

  it('persists an entry with a generated ULID id and server timestamp', async () => {
    await runWithRequestContext({ requestId: 'r1', clientIp: '198.51.100.4', userId: 'user-42' }, () =>
      service.record({
        action: 'identity.user_registered',
        targetType: 'user',
        targetId: 'user-42',
        metadata: { via: 'invite' },
      })
    );

    const row = await expectAuditEntry({ orm: database.db.orm }, 'identity.user_registered', {
      actorUserId: 'user-42',
      actorIp: '198.51.100.4',
      targetType: 'user',
      targetId: 'user-42',
    });
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.at).toBeTypeOf('string');
    expect(row.metadata).toEqual({ via: 'invite' });
  });

  it('records a system action when there is no request context', async () => {
    await service.record({ action: 'server.migrated' });
    await expectAuditEntry({ orm: database.db.orm }, 'server.migrated', { actorUserId: null, actorIp: null });
  });

  it('expectNoAuditEntry passes for an action never recorded', async () => {
    await expectNoAuditEntry({ orm: database.db.orm }, 'never.happened');
  });
});
