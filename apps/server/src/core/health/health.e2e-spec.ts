import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

// `/readyz` checks real dependencies (DB, schema, signing key, storage driver),
// so this boots the full `AppModule` against Testcontainers PostgreSQL.
describe('health endpoints (e2e)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('GET /healthz is 200 liveness with no dependency detail', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
  });

  it('does not answer other methods on /healthz', async () => {
    await request(app.getHttpServer()).post('/healthz').expect(404);
  });

  it('GET /readyz is 200 with a per-check breakdown when every dependency is up', async () => {
    const res = await request(app.getHttpServer()).get('/readyz').expect(200);

    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.migrations.ok).toBe(true);
    expect(res.body.checks.signing_key.ok).toBe(true);
    expect(res.body.checks.storage.ok).toBe(true);
  });
});
