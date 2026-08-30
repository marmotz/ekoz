import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { ServerIdentityService } from './server-identity.service.js';

describe('ServerIdentityService (integration)', () => {
  let database: TestDatabase;

  const makeService = (domain: string) =>
    new ServerIdentityService(
      { get: () => domain } as unknown as ConfigService,
      {
        orm: database.db.orm,
      } as unknown as PrismaService
    );

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('pins the domain on first boot and accepts the same domain later', async () => {
    await makeService('chat.example').onModuleInit();
    expect(await makeService('chat.example').recordedDomain()).toBe('chat.example');

    await expect(makeService('chat.example').onModuleInit()).resolves.toBeUndefined();
  });

  it('refuses to start when server.domain changed', async () => {
    await expect(makeService('other.example').onModuleInit()).rejects.toThrow(
      /server\.domain.*changed.*chat\.example.*other\.example/s
    );
  });

  it('rejects an invalid domain outright', async () => {
    await expect(makeService('localhost').onModuleInit()).rejects.toThrow(/FQDN/);
  });
});
