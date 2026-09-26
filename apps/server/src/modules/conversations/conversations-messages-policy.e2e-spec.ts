import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';

/** `GET /messages/policy`, end to end against a real database. */
describe('conversations — messages policy (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let config: ConfigService;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
    config = app.get(ConfigService);
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  it('is public and answers with the default limit, uncached', async () => {
    const res = await request(server()).get('/messages/policy').expect(200);
    expect(res.body).toEqual({ bodyMaxLength: 16_000, editWindow: null });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reflects a limit change on the next call', async () => {
    await config.set('messages.body_max_length', 500, null);
    try {
      const res = await request(server()).get('/messages/policy').expect(200);
      expect(res.body.bodyMaxLength).toBe(500);
    } finally {
      await config.set('messages.body_max_length', 16_000, null);
    }
    const back = await request(server()).get('/messages/policy').expect(200);
    expect(back.body.bodyMaxLength).toBe(16_000);
  });

  it('exposes the edit window in seconds, and null when unlimited', async () => {
    await config.set('messages.edit_window', 900, null);
    try {
      const res = await request(server()).get('/messages/policy').expect(200);
      expect(res.body.editWindow).toBe(900);
    } finally {
      await config.set('messages.edit_window', null, null);
    }
    const back = await request(server()).get('/messages/policy').expect(200);
    expect(back.body.editWindow).toBeNull();
  });
});
