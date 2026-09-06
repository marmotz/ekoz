import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { sha256Hex } from '../../core/crypto/hashing.js';
import { MailService } from '../../core/mail/mail.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from './accounts/account.service.js';

/**
 * Registration modes and invitations (#15), email verification and change
 * (#16), and the first-owner setup endpoint (#18), end to end against a real
 * database. Outbound mail is stubbed so the tests can read the tokens the
 * server hands to `MailService`.
 */
describe('identity — registration, verification, setup (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let config: ConfigService;
  let sentMail: Array<{ to: string; template: string; vars: Record<string, string | number> }>;

  const ownerEmail = 'owner@ekoz.example.com';
  const password = 'a-perfectly-fine-passphrase';

  const tokenFromLastMail = (template: string): string => {
    const mail = [...sentMail].reverse().find((m) => m.template === template);
    if (!mail) throw new Error(`no ${template} mail was sent`);
    return new URL(String(mail.vars.verifyUrl)).searchParams.get('token') ?? '';
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_INITIAL_OWNER_EMAIL = ownerEmail;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    config = app.get(ConfigService);
    sentMail = [];
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (args) => {
      sentMail.push({ to: args.to, template: args.template, vars: args.vars });
    });
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_INITIAL_OWNER_EMAIL;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  let ownerAccessToken: string;

  it('creates the first owner (email-pinned) and then closes /setup', async () => {
    const res = await request(server())
      .post('/setup/owner')
      .send({ email: ownerEmail, password, name: 'owner', displayName: 'The Owner' })
      .expect(201);

    expect(res.body.user).toMatchObject({
      isOwner: true,
      emailVerified: true,
      identifier: 'owner/ekoz.example.com',
    });
    expect(res.body.accessToken).toBeTypeOf('string');
    ownerAccessToken = res.body.accessToken;

    await request(server())
      .post('/setup/owner')
      .send({ email: ownerEmail, password, name: 'owner2', displayName: 'x' })
      .expect(410);
  });

  it('rejects registration in invite mode without a valid invitation', async () => {
    await request(server())
      .post('/auth/register')
      .send({
        name: 'mallory',
        email: 'mallory@ekoz.example.com',
        password,
        displayName: 'Mallory',
      })
      .expect(422);
  });

  let invitationToken: string;

  it('an owner issues an invitation', async () => {
    const res = await request(server())
      .post('/invitations')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({})
      .expect(201);
    expect(res.body).toMatchObject({ id: expect.any(String), token: expect.any(String) });
    expect(res.body.url).toContain('/register?invite=');
    invitationToken = res.body.token;

    const list = await request(server())
      .get('/invitations')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ status: 'pending' });
  });

  it('registers with the invitation, gates login until the email is verified', async () => {
    const reg = await request(server())
      .post('/auth/register')
      .send({
        name: 'bob',
        email: 'bob@ekoz.example.com',
        password,
        displayName: 'Bob',
        invitationToken,
      })
      .expect(201);
    expect(reg.body).toMatchObject({ emailVerified: false, identifier: 'bob/ekoz.example.com' });

    await request(server()).post('/auth/login').send({ identifier: 'bob', password }).expect(403);

    const token = tokenFromLastMail('email-verification');
    await request(server()).post('/auth/verify-email').send({ token }).expect(200);

    await request(server()).post('/auth/login').send({ identifier: 'bob', password }).expect(200);
  });

  it('refuses to reuse a consumed invitation', async () => {
    await request(server())
      .post('/auth/register')
      .send({
        name: 'eve',
        email: 'eve@ekoz.example.com',
        password,
        displayName: 'Eve',
        invitationToken,
      })
      .expect(422);
  });

  it('rejects a weak password', async () => {
    const invite = await request(server())
      .post('/invitations')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({})
      .expect(201);
    const res = await request(server())
      .post('/auth/register')
      .send({
        name: 'weak',
        email: 'weak@ekoz.example.com',
        password: 'short',
        displayName: 'Weak',
        invitationToken: invite.body.token,
      })
      .expect(422);
    expect(res.body.code).toBe('identity.password_too_weak');
  });

  it('open mode registers without an invitation', async () => {
    await config.set('registration.mode', 'open', null);
    try {
      const res = await request(server())
        .post('/auth/register')
        .send({ name: 'olivia', email: 'olivia@ekoz.example.com', password, displayName: 'Olivia' })
        .expect(201);
      expect(res.body).toMatchObject({
        identifier: 'olivia/ekoz.example.com',
        emailVerified: false,
      });
      // Verification is still required, so login is gated until the mail is consumed.
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'olivia', password })
        .expect(403);
      await request(server())
        .post('/auth/verify-email')
        .send({ token: tokenFromLastMail('email-verification') })
        .expect(200);
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'olivia', password })
        .expect(200);
    } finally {
      await config.set('registration.mode', 'invite', null);
    }
  });

  it('POST /auth/verify-email is idempotent for an already-verified address', async () => {
    const bob = await app.get(AccountService).findByEmail('bob@ekoz.example.com');
    expect(bob?.emailVerifiedAt).not.toBeNull();

    // A still-live verification token for an address that is already verified
    // (e.g. a second link from a resend, clicked after the first).
    await app.get(PrismaService).orm.public.EmailVerification.create({
      userId: bob!.id,
      email: 'bob@ekoz.example.com',
      tokenHash: sha256Hex('idempotent-token'),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      consumedAt: null,
    });

    const res = await request(server())
      .post('/auth/verify-email')
      .send({ token: 'idempotent-token' })
      .expect(200);
    expect(res.body).toEqual({ verified: true });
  });

  it('admin mode closes /auth/register but the owner can still create accounts', async () => {
    await config.set('registration.mode', 'admin', null);

    const closed = await request(server())
      .post('/auth/register')
      .send({ name: 'x', email: 'x@ekoz.example.com', password, displayName: 'X' })
      .expect(403);
    expect(closed.body.code).toBe('identity.registration_closed');

    await request(server())
      .post('/admin/users')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'carol', email: 'carol@ekoz.example.com', password, displayName: 'Carol' })
      .expect(201);

    await config.set('registration.mode', 'invite', null);
  });

  it('always answers 202 to a verification resend, without leaking existence', async () => {
    await request(server())
      .post('/auth/verify-email/resend')
      .send({ email: 'ghost@ekoz.example.com' })
      .expect(202);
  });

  it('changes an email address only after the new address is verified', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'carol', password })
      .expect(200);

    await request(server())
      .post('/me/email')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail: 'carol.new@ekoz.example.com', password })
      .expect(202);

    // Not applied yet.
    expect(await app.get(AccountService).findByEmail('carol.new@ekoz.example.com')).toBeNull();

    const token = tokenFromLastMail('email-verification');
    await request(server()).post('/auth/verify-email').send({ token }).expect(200);

    const moved = await app.get(AccountService).findByEmail('carol.new@ekoz.example.com');
    expect(moved?.name).toBe('carol');
    expect(
      sentMail.some(
        (m) => m.template === 'email-changed-notice' && m.to === 'carol@ekoz.example.com',
      ),
    ).toBe(true);
  });
});
