import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../config/config.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

const TOKEN = 'scrape-secret-token';

describe('GET /metrics (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let config: ConfigService;
  let restoreConfig: () => void;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env['DATABASE_URL'] = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env['EKOZ_OBSERVABILITY__METRICS_TOKEN'] = TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
    config = app.get(ConfigService);
  }, 180_000);

  afterAll(async () => {
    delete process.env['EKOZ_OBSERVABILITY__METRICS_TOKEN'];
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('returns 404 while metrics are disabled (before the token check)', async () => {
    await config.clear('observability.metrics_enabled');
    await request(app.getHttpServer()).get('/metrics').expect(404);
  });

  it('returns 401 when enabled and the bearer token is missing', async () => {
    await config.set('observability.metrics_enabled', true, null);
    await request(app.getHttpServer()).get('/metrics').expect(401);
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer wrong')
      .expect(401);
  });

  it('serves Prometheus text with the correct bearer token', async () => {
    await config.set('observability.metrics_enabled', true, null);
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('process_uptime_seconds');
  });

  it('keeps /healthz serving and excluded from the scrape path', async () => {
    await config.set('observability.metrics_enabled', true, null);
    await request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.text).toContain('process_resident_memory_bytes');
  });

  it('exposes the database, email and blob baseline instrument names', async () => {
    await config.set('observability.metrics_enabled', true, null);
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    for (const name of [
      'db_client_connections_max',
      'email_queue_depth',
      'email_send_attempts_total',
      'blob_bytes_total',
    ]) {
      expect(res.text).toContain(name);
    }
  });
});
