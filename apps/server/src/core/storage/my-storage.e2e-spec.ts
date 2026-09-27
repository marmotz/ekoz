import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

/**
 * `GET /me/storage` and the quota gate on `PUT /me/avatar` (technical.md §S8,
 * issue #138), against a real database and full app.
 */
describe('GET /me/storage and avatar quota (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let token: string;
  let userId: string;

  // 1x1 transparent PNG.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    const account = await app.get(AccountService).createAccount({
      name: 'quota-user',
      email: 'quota-user@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Quota User',
      emailVerified: true,
    });
    userId = account.id;

    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'quota-user', password: 'a-perfectly-fine-passphrase' })
      .expect(200);
    token = login.body.accessToken;
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('reports usage against the default quota with no override', async () => {
    const res = await request(server())
      .get('/me/storage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ usedBytes: '0', pendingBytes: '0' });
    expect(typeof res.body.quotaBytes === 'string' || res.body.quotaBytes === null).toBe(true);
  });

  it('refuses an avatar upload that would exceed the caller’s storage quota', async () => {
    await database.db.orm.public.StorageQuotaOverride.create({
      userId,
      quotaBytes: 0n,
      updatedAt: new Date().toISOString(),
    });

    const res = await request(server())
      .put('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pngBytes, 'a.png')
      .expect(403);
    expect(res.body.code).toBe('upload.quota_exceeded');
    expect(res.body.details).toMatchObject({ quotaBytes: '0' });
  });

  it('allows the upload once the override is lifted, and usage then reflects it', async () => {
    await database.db.orm.public.StorageQuotaOverride.where({ userId }).delete();

    await request(server())
      .put('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pngBytes, 'a.png')
      .expect(200);

    const res = await request(server())
      .get('/me/storage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(BigInt(res.body.usedBytes)).toBeGreaterThan(0n);
  });
});
