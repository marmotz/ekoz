import { describe, expect, it, vi } from 'vitest';
import type { SigningService } from '../crypto/signing.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { ReadinessService } from './readiness.service.js';

function build(overrides: { dbOk?: boolean; schemaOk?: boolean; signingKey?: boolean; storageOk?: boolean }) {
  const { dbOk = true, schemaOk = true, signingKey = true, storageOk = true } = overrides;
  const prisma = {
    healthCheck: vi.fn(dbOk ? async () => undefined : async () => Promise.reject(new Error('pool closed'))),
    orm: {
      public: {
        Setting: {
          where: () => ({
            first: schemaOk ? async () => null : async () => Promise.reject(new Error('schema behind')),
          }),
        },
      },
    },
  } as unknown as PrismaService;
  const signing = { hasActiveKey: vi.fn(async () => signingKey) } as unknown as SigningService;
  const storage = {
    healthCheck: vi.fn(storageOk ? async () => undefined : async () => Promise.reject(new Error('read-only fs'))),
  } as unknown as StorageDriver;

  return new ReadinessService(prisma, signing, storage);
}

describe('ReadinessService (unit)', () => {
  it('reports ready when every check passes', async () => {
    const report = await build({}).check();
    expect(report.status).toBe('ready');
    expect(Object.values(report.checks).every((c) => c.ok)).toBe(true);
  });

  it('reports not_ready and names the failing check', async () => {
    const report = await build({ dbOk: false }).check();
    expect(report.status).toBe('not_ready');
    expect(report.checks.database).toEqual({ ok: false, detail: 'pool closed' });
    expect(report.checks.storage!.ok).toBe(true);
  });

  it('flags a missing signing key', async () => {
    const report = await build({ signingKey: false }).check();
    expect(report.status).toBe('not_ready');
    expect(report.checks.signing_key!.detail).toBe('no active signing key');
  });

  it('flags an unwritable storage driver', async () => {
    const report = await build({ storageOk: false }).check();
    expect(report.checks.storage).toEqual({ ok: false, detail: 'read-only fs' });
  });
});
