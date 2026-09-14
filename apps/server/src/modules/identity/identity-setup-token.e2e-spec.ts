import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { MailService } from '../../core/mail/mail.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';

/**
 * First-owner setup on a token-pinned boot (technical.md §1, ADR 0010, issue
 * #18): no `EKOZ_INITIAL_OWNER_EMAIL`, so `POST /setup/owner` must carry the
 * single-use token that `SetupService` prints once at boot.
 */
describe('identity — first-owner setup, token-pinned (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let setupToken: string;

  const password = 'a-perfectly-fine-passphrase';

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    delete process.env.EKOZ_INITIAL_OWNER_EMAIL;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    // The token only ever exists in the boot log line; capture it there.
    const warn = vi.spyOn(Logger.prototype, 'warn');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    vi.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);

    const line = warn.mock.calls
      .map((c) => String(c[0]))
      .find((m) => m.includes('single-use token'));
    setupToken = /\n {4}([A-Za-z0-9_-]+)\n/.exec(line ?? '')?.[1] ?? '';
    expect(setupToken).not.toBe('');
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  it('GET /setup reports token-pinned before the owner exists', async () => {
    const res = await request(server()).get('/setup').expect(200);
    expect(res.body).toEqual({ state: 'token-pinned' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects a wrong token', async () => {
    const res = await request(server())
      .post('/setup/owner')
      .send({
        token: 'not-the-token',
        email: 'owner@ekoz.example.com',
        password,
        name: 'owner',
        displayName: 'Owner',
      })
      .expect(403);
    expect(res.body.code).toBe('identity.setup_rejected');
  });

  it('creates the owner with the printed token, then closes /setup', async () => {
    const res = await request(server())
      .post('/setup/owner')
      .send({
        token: setupToken,
        email: 'owner@ekoz.example.com',
        password,
        name: 'owner',
        displayName: 'Owner',
      })
      .expect(201);
    expect(res.body.user).toMatchObject({ isOwner: true, emailVerified: true });
    expect(res.body.accessToken).toBeTypeOf('string');

    await request(server())
      .post('/setup/owner')
      .send({
        token: setupToken,
        email: 'owner@ekoz.example.com',
        password,
        name: 'owner2',
        displayName: 'x',
      })
      .expect(410);

    const state = await request(server()).get('/setup').expect(200);
    expect(state.body).toEqual({ state: 'closed' });
  });
});
