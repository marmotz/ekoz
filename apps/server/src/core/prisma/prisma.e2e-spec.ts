import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { PrismaService } from './prisma.service.js';
import { startTestDatabase, type TestDatabase } from './testing/test-database.js';

describe('Prisma database access (integration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('applies the migration: the settings table is queryable', async () => {
    const rows = await database.db.orm.public.Setting.all();
    expect(rows).toEqual([]);
  });

  it('round-trips a row through the ORM surface', async () => {
    await database.db.orm.public.Setting.create({
      key: 'registration.mode',
      value: { mode: 'invite' },
    });

    const row = await database.db.orm.public.Setting.where({ key: 'registration.mode' }).first();
    expect(row?.value).toEqual({ mode: 'invite' });
    expect(row?.updatedAt).toBeTypeOf('string');
  });

  it('rolls back the per-test transaction', async () => {
    await database.inRollback(async (tx) => {
      await tx.orm.public.Setting.create({ key: 'temp.key', value: { n: 1 } });
      expect(await tx.orm.public.Setting.where({ key: 'temp.key' }).first()).not.toBeNull();
    });

    expect(await database.db.orm.public.Setting.where({ key: 'temp.key' }).first()).toBeNull();
  });

  describe('wired into a NestJS application', () => {
    let app: INestApplication;
    let restoreConfig: () => void;

    beforeAll(async () => {
      process.env.DATABASE_URL = database.url;
      restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.enableShutdownHooks();
      await app.init();
    });

    afterAll(async () => {
      restoreConfig?.();
      await app?.close();
    });

    it('connects and verifies the schema on module init', async () => {
      await expect(app.get(PrismaService).healthCheck()).resolves.toBeUndefined();
    });
  });
});
