import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { MIN_PASSWORD_LENGTH } from './accounts/password.service.js';

/** `GET /auth/policy`, end to end against a real database. */
describe('identity — auth policy (integration)', () => {
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

  it('is public and answers with the defaults, uncached', async () => {
    const res = await request(server()).get('/auth/policy').expect(200);
    expect(res.body).toEqual({
      registrationMode: 'invite',
      emailVerificationRequired: true,
      passwordMinLength: MIN_PASSWORD_LENGTH,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(['open', 'invite', 'admin'] as const)('reflects registration mode %s', async (mode) => {
    await config.set('registration.mode', mode, null);
    try {
      const res = await request(server()).get('/auth/policy').expect(200);
      expect(res.body.registrationMode).toBe(mode);
    } finally {
      await config.set('registration.mode', 'invite', null);
    }
  });

  it('reflects the email verification flag on the next call', async () => {
    await config.set('email.verification_required', false, null);
    try {
      const off = await request(server()).get('/auth/policy').expect(200);
      expect(off.body.emailVerificationRequired).toBe(false);
    } finally {
      await config.set('email.verification_required', true, null);
    }
    const on = await request(server()).get('/auth/policy').expect(200);
    expect(on.body.emailVerificationRequired).toBe(true);
  });
});
