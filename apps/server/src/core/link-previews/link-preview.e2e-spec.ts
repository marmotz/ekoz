import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { ConfigService } from '../config/config.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

/**
 * `POST /link-previews` (technical.md §S10, issue #144). No real outbound
 * fetch: every case seeds the `LinkPreview` cache row directly so `resolve()`
 * hits the cache — the fetch mechanics themselves are covered by
 * `core/net/safe-fetch.spec.ts`.
 */
describe('POST /link-previews (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let config: ConfigService;
  let prisma: PrismaService;
  let token: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    config = app.get(ConfigService);
    prisma = app.get(PrismaService);
    await app.get(AccountService).createAccount({
      name: 'previewer',
      email: 'previewer@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Previewer',
      emailVerified: true,
    });
    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'previewer', password: 'a-perfectly-fine-passphrase' })
      .expect(200);
    token = login.body.accessToken;

    await app.get(AccountService).createAccount({
      name: 'throttled',
      email: 'throttled@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Throttled',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const seed = async (url: string, fields: Partial<Record<string, unknown>>) =>
    prisma.orm.public.LinkPreview.create({
      url,
      title: null,
      description: null,
      siteName: null,
      imageBlobId: null,
      status: 'ready',
      fetchedAt: new Date().toISOString(),
      ...fields,
    });

  it('returns 404 link_preview.disabled when the feature is off', async () => {
    await config.clear('link_previews.enabled');
    const res = await request(server())
      .post('/link-previews')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/off' })
      .expect(404);
    expect(res.body.code).toBe('link_preview.disabled');
  });

  it('returns a cached preview view', async () => {
    await config.set('link_previews.enabled', true, null);
    try {
      await seed('https://example.com/cached', {
        title: 'Cached page',
        description: 'A description',
        siteName: 'Example',
      });

      const res = await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://example.com/cached' })
        .expect(200);
      expect(res.body).toMatchObject({
        url: 'https://example.com/cached',
        title: 'Cached page',
        description: 'A description',
        siteName: 'Example',
        hasImage: false,
      });
    } finally {
      await config.clear('link_previews.enabled');
    }
  });

  it('returns 204 when the cached entry has nothing to show', async () => {
    await config.set('link_previews.enabled', true, null);
    try {
      await seed('https://example.com/empty', {});

      await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://example.com/empty' })
        .expect(204);
    } finally {
      await config.clear('link_previews.enabled');
    }
  });

  it('rejects a malformed url', async () => {
    await config.set('link_previews.enabled', true, null);
    try {
      const res = await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'not-a-url' })
        .expect(422);
      expect(res.body.code).toBe('validation_failed');
    } finally {
      await config.clear('link_previews.enabled');
    }
  });

  it('throttles repeated requests per user', async () => {
    const throttledLogin = await request(server())
      .post('/auth/login')
      .send({ identifier: 'throttled', password: 'a-perfectly-fine-passphrase' })
      .expect(200);
    const throttledToken = throttledLogin.body.accessToken as string;

    await config.set('link_previews.enabled', true, null);
    await config.set('link_previews.throttle', { window: '60s', max: 2 }, null);
    try {
      await seed('https://example.com/throttle-1', { title: 'One' });
      await seed('https://example.com/throttle-2', { title: 'Two' });
      await seed('https://example.com/throttle-3', { title: 'Three' });

      await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${throttledToken}`)
        .send({ url: 'https://example.com/throttle-1' })
        .expect(200);
      await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${throttledToken}`)
        .send({ url: 'https://example.com/throttle-2' })
        .expect(200);
      const throttled = await request(server())
        .post('/link-previews')
        .set('Authorization', `Bearer ${throttledToken}`)
        .send({ url: 'https://example.com/throttle-3' })
        .expect(429);
      expect(throttled.body.code).toBe('link_preview.too_many_requests');
      expect(throttled.headers['retry-after']).toBeDefined();
    } finally {
      await config.clear('link_previews.enabled');
      await config.clear('link_previews.throttle');
    }
  });
});
