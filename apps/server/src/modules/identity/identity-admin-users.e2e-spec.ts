import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { expectAuditEntry } from '../../core/audit/testing/audit-assertions.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { MailService } from '../../core/mail/mail.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from './accounts/account.service.js';

/**
 * Admin account reads and owner-triggered password reset (technical.md
 * §2.1-§2.3, issue #14), end to end against a real database.
 */
describe('identity — admin users (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let sentMail: Array<{ to: string; template: string }>;

  const password = 'a-perfectly-fine-passphrase';

  const login = async (identifier: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    accounts = app.get(AccountService);
    sentMail = [];
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (args) => {
      sentMail.push({ to: args.to, template: args.template });
    });

    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    await accounts.createAccount({
      name: 'alice',
      email: 'alice@ekoz.example.com',
      password,
      displayName: 'Alice Wonderland',
      emailVerified: true,
    });
    await accounts.createAccount({
      name: 'bob',
      email: 'bob@ekoz.example.com',
      password,
      displayName: 'Bob Builder',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  it('rejects a non-owner with 403', async () => {
    const token = await login('alice');
    await request(server()).get('/admin/users').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('lists accounts and paginates with a keyset cursor', async () => {
    const token = await login('owner');

    const first = await request(server())
      .get('/admin/users')
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTypeOf('string');

    const second = await request(server())
      .get('/admin/users')
      .query({ limit: 2, cursor: first.body.nextCursor })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.items.length).toBeGreaterThan(0);

    const firstIds = first.body.items.map((i: { id: string }) => i.id);
    const secondIds = second.body.items.map((i: { id: string }) => i.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
  });

  it('searches across name, email and displayName', async () => {
    const token = await login('owner');

    const byName = await request(server())
      .get('/admin/users')
      .query({ q: 'alice' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byName.body.items.map((i: { identifier: string }) => i.identifier)).toEqual([
      'alice/ekoz.example.com',
    ]);

    const byDisplayName = await request(server())
      .get('/admin/users')
      .query({ q: 'Builder' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byDisplayName.body.items.map((i: { identifier: string }) => i.identifier)).toEqual([
      'bob/ekoz.example.com',
    ]);
  });

  it('filters by status and owner', async () => {
    const token = await login('owner');

    const owners = await request(server())
      .get('/admin/users')
      .query({ owner: 'true' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(owners.body.items.map((i: { identifier: string }) => i.identifier)).toEqual([
      'owner/ekoz.example.com',
    ]);
  });

  it('reads account detail, 404 for an unknown id', async () => {
    const token = await login('owner');
    const aliceId = (await accounts.findByIdentifier('alice'))!.id;

    const res = await request(server())
      .get(`/admin/users/${aliceId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      identifier: 'alice/ekoz.example.com',
      emailVerifiedAt: expect.any(String),
    });
    expect(res.body.activeSessionCount).toBeGreaterThanOrEqual(1);

    await request(server())
      .get('/admin/users/01ARZ3NDEKTSV4RRFFQ69G5FAV')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('triggers a password-reset mail, 404 unknown user, 409 deleted account', async () => {
    const ownerToken = await login('owner');
    const ownerId = (await accounts.findByIdentifier('owner'))!.id;
    const aliceId = (await accounts.findByIdentifier('alice'))!.id;

    await request(server())
      .post(`/admin/users/${aliceId}/password-reset`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(202, { accepted: true });
    expect(
      sentMail.some((m) => m.to === 'alice@ekoz.example.com' && m.template === 'password-reset'),
    ).toBe(true);
    await expectAuditEntry(database.db, 'identity.password_reset_triggered', {
      actorUserId: ownerId,
      targetType: 'user',
      targetId: aliceId,
    });

    await request(server())
      .post('/admin/users/01ARZ3NDEKTSV4RRFFQ69G5FAV/password-reset')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    await accounts.createAccount({
      name: 'trent',
      email: 'trent@ekoz.example.com',
      password,
      displayName: 'Trent',
      emailVerified: true,
    });
    const trentToken = await login('trent');
    const trentId = (await accounts.findByIdentifier('trent'))!.id;
    await request(server())
      .delete('/me')
      .set('Authorization', `Bearer ${trentToken}`)
      .send({ password })
      .expect(204);

    const res = await request(server())
      .post(`/admin/users/${trentId}/password-reset`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('identity.account_deleted');
  });
});
