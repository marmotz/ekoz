import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../config/config.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { buildCorsOptions } from './cors.js';

/**
 * `app.enableCors(...)` is applied in `main.ts`'s bootstrap script, not
 * `AppModule` itself (technical.md §2.5, issue #15) — so this spec reproduces
 * that one call on a test app to check the actual response headers, the way
 * `main.ts` does after `app.init()`.
 */
describe('CORS (e2e)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_HTTP__CORS_ALLOWED_ORIGINS = 'https://admin.ekoz.example.com';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();

    // Mirrors main.ts: enableCors before app.init() registers the routes.
    const bootConfig = new ConfigService();
    await bootConfig.init();
    const corsOptions = buildCorsOptions(bootConfig.get('http.cors_allowed_origins'));
    if (corsOptions) {
      app.enableCors(corsOptions);
    }

    app.enableShutdownHooks();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_HTTP__CORS_ALLOWED_ORIGINS;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('reflects an allow-listed origin and omits credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/healthz')
      .set('Origin', 'https://admin.ekoz.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('https://admin.ekoz.example.com');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not reflect a non-allow-listed origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/healthz')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the tus upload headers on a preflight request', async () => {
    const res = await request(app.getHttpServer())
      .options('/uploads')
      .set('Origin', 'https://admin.ekoz.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization, upload-length, upload-metadata')
      .expect(204);

    expect(res.headers['access-control-allow-headers']).toContain('upload-length');
    expect(res.headers['access-control-allow-headers']).toContain('upload-metadata');
    expect(res.headers['access-control-expose-headers']).toContain('location');
    expect(res.headers['access-control-expose-headers']).toContain('upload-offset');
  });
});
