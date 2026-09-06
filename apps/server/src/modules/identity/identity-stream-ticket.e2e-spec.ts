import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from './accounts/account.service.js';
import { TicketService } from './auth/ticket.service.js';

/**
 * SSE stream ticket endpoint (technical.md §12, issue #23): `POST /stream/ticket`
 * mints a single-use token bound to the caller's `{ userId, sessionId }` that
 * the `GET /events` consumer later trades via {@link TicketService.consume}.
 */
describe('identity — SSE stream ticket (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;

  const password = 'correct horse battery staple';

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env['DATABASE_URL'] = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env['EKOZ_EMAIL__VERIFICATION_REQUIRED'] = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    await app.get(AccountService).createAccount({
      name: 'alice',
      email: 'alice@example.com',
      password,
      displayName: 'Alice',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    delete process.env['EKOZ_EMAIL__VERIFICATION_REQUIRED'];
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  async function login(): Promise<{ accessToken: string; sessionId: string }> {
    const res = await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password })
      .expect(200);

    return { accessToken: res.body.accessToken, sessionId: res.body.session.id };
  }

  it('rejects an unauthenticated caller', async () => {
    await request(server()).post('/stream/ticket').expect(401);
  });

  it('issues a ticket the consumer can trade exactly once for the session binding', async () => {
    const { accessToken, sessionId } = await login();

    const res = await request(server())
      .post('/stream/ticket')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.ticket).toMatch(/^[\w-]{40,}$/);
    expect(res.body.expiresIn).toBeGreaterThan(0);

    const tickets = app.get(TicketService);
    const binding = await tickets.consume(res.body.ticket);
    expect(binding).toMatchObject({ sessionId });
    expect(binding?.userId).toBeTypeOf('string');

    expect(await tickets.consume(res.body.ticket)).toBeNull();
  });
});
