import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { HealthModule } from './health.module.js';

// Liveness has no dependencies (technical.md §9), so this boots `HealthModule`
// alone — no database, no Testcontainers.
describe('GET /healthz (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with {status:"ok"}', async () => {
    await request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({ status: 'ok' });
  });

  it('does not answer other methods on the route', async () => {
    await request(app.getHttpServer()).post('/healthz').expect(404);
  });
});
