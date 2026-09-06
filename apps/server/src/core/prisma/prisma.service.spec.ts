import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';

const DUMMY_URL = 'postgresql://user:pass@localhost:5432/db';

describe('PrismaService (unit)', () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = DUMMY_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it('exposes the query surfaces without opening a connection (lazy connect)', () => {
    const service = new PrismaService();

    expect(service.orm.public.Setting).toBeDefined();
    expect(service.raw.sql).toBeTypeOf('function');
    expect(service.transaction).toBeTypeOf('function');
  });

  it('throws a clear error when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(/DATABASE_URL is not set/);
  });

  it('is resolvable through the Nest DI container (decorator metadata is emitted)', async () => {
    const moduleRef = await Test.createTestingModule({ providers: [PrismaService] }).compile();

    expect(moduleRef.get(PrismaService)).toBeInstanceOf(PrismaService);
  });

  it('onModuleInit tolerates a pool opened lazily by another module', async () => {
    const service = new PrismaService();
    const db = (
      service as unknown as { db: { connect: () => Promise<unknown>; raw: { sql: unknown } } }
    ).db;

    db.connect = () =>
      Promise.reject(
        Object.assign(new Error('Postgres client already connected'), {
          code: 'DRIVER.ALREADY_CONNECTED',
        }),
      );
    (service as unknown as { healthCheck: () => Promise<void> }).healthCheck = () =>
      Promise.resolve();

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('onModuleInit still rethrows other connection failures', async () => {
    const service = new PrismaService();
    const db = (service as unknown as { db: { connect: () => Promise<unknown> } }).db;

    db.connect = () => Promise.reject(new Error('connection refused'));

    await expect(service.onModuleInit()).rejects.toThrow(/connection refused/);
  });
});
