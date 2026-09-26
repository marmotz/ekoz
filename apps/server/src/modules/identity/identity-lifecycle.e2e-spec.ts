import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { MailService } from '../../core/mail/mail.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from './accounts/account.service.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';

/**
 * Password reset (#17), profile and avatar (#19), policy-driven identifier
 * changes (#20), suspension / deletion / owners (#21) and the credential
 * throttle (#22), end to end against a real database. Mail is stubbed so the
 * reset token can be read.
 */
describe('identity — lifecycle, profile, throttle (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let config: ConfigService;
  let accounts: AccountService;
  let sentMail: Array<{ to: string; template: string; vars: Record<string, string | number> }>;

  const password = 'a-perfectly-fine-passphrase';
  // 1x1 transparent PNG.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const login = async (identifier: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
  };

  const resetTokenFromLastMail = (): string => {
    const mail = [...sentMail].reverse().find((m) => m.template === 'password-reset');
    if (!mail) throw new Error('no password-reset mail was sent');

    return new URL(String(mail.vars.resetUrl)).searchParams.get('token') ?? '';
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    config = app.get(ConfigService);
    accounts = app.get(AccountService);
    sentMail = [];
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (args) => {
      sentMail.push({ to: args.to, template: args.template, vars: args.vars });
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
      displayName: 'Alice',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const server = () => app.getHttpServer();

  // ── #17 password reset ────────────────────────────────────────────────────

  it('resets a password, revoking every session, and answers 202 for an unknown email', async () => {
    const before = await login('alice');
    await request(server()).get('/me').set('Authorization', `Bearer ${before}`).expect(200);

    await request(server())
      .post('/auth/password-reset/request')
      .send({ email: 'nobody@ekoz.example.com' })
      .expect(202);
    await request(server())
      .post('/auth/password-reset/request')
      .send({ email: 'alice@ekoz.example.com' })
      .expect(202);

    const token = resetTokenFromLastMail();
    const newPassword = 'another-totally-fine-passphrase';
    await request(server())
      .post('/auth/password-reset/confirm')
      .send({ token, newPassword })
      .expect(204);

    // Old sessions are dead, the new password works.
    await request(server()).get('/me').set('Authorization', `Bearer ${before}`).expect(401);
    await request(server()).post('/auth/login').send({ identifier: 'alice', password }).expect(401);
    await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password: newPassword })
      .expect(200);

    // Reusing the reset token fails.
    await request(server())
      .post('/auth/password-reset/confirm')
      .send({ token, newPassword: 'yet-another-fine-passphrase' })
      .expect(422);

    // Restore Alice's canonical password for the later tests.
    await request(server())
      .post('/auth/password-reset/request')
      .send({ email: 'alice@ekoz.example.com' })
      .expect(202);
    await request(server())
      .post('/auth/password-reset/confirm')
      .send({ token: resetTokenFromLastMail(), newPassword: password })
      .expect(204);
  });

  // ── #19 profile and avatar ────────────────────────────────────────────────

  it('reads and updates the own profile, and reads a public profile', async () => {
    const token = await login('alice');

    const me = await request(server())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({
      identifier: 'alice/ekoz.example.com',
      isOwner: false,
      status: 'active',
    });

    await request(server())
      .patch('/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Alice A.', bio: 'hi there' })
      .expect(200);

    const pub = await request(server())
      .get('/users/alice')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pub.body).toMatchObject({
      identifier: 'alice/ekoz.example.com',
      displayName: 'Alice A.',
      bio: 'hi there',
    });
    expect(pub.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await request(server())
      .patch('/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'x'.repeat(10_000) })
      .expect(422);
  });

  it('summarises users by id in request order, collapsing duplicates and hiding unknown or deleted ids', async () => {
    const aliceId = (await accounts.findByIdentifier('alice'))?.id ?? '';
    const ownerId = (await accounts.findByIdentifier('owner'))?.id ?? '';
    await accounts.createAccount({
      name: 'gone',
      email: 'gone@ekoz.example.com',
      password,
      displayName: 'Gone',
      emailVerified: true,
    });
    const goneToken = await login('gone');
    const goneId = (await accounts.findByIdentifier('gone'))?.id ?? '';
    await request(server())
      .delete('/me')
      .set('Authorization', `Bearer ${goneToken}`)
      .send({ password })
      .expect(204);
    const unknownId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

    await request(server()).get(`/users?ids=${aliceId}`).expect(401);

    const token = await login('alice');
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(server())
      .get(`/users?ids=${ownerId},${goneId},${aliceId},${ownerId},${unknownId}`)
      .set(auth)
      .expect(200);

    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      ownerId,
      goneId,
      aliceId,
      unknownId,
    ]);
    expect(res.body.items[0]).toMatchObject({
      identifier: 'owner/ekoz.example.com',
      displayName: 'The Owner',
    });
    expect(res.body.items[2]).toMatchObject({ identifier: 'alice/ekoz.example.com' });
    // A deleted and an unknown id are indistinguishable.
    const deleted = { identifier: null, displayName: null, avatarUrl: null };
    expect(res.body.items[1]).toEqual({ id: goneId, ...deleted });
    expect(res.body.items[3]).toEqual({ id: unknownId, ...deleted });
  });

  it('rejects an empty, oversized or malformed user id list with a 422', async () => {
    const token = await login('alice');
    const auth = { Authorization: `Bearer ${token}` };
    const idAt = (n: number) => `01ARZ3NDEKTSV4RRFFQ69G${String(n).padStart(4, '0')}`;
    const many = (count: number) => Array.from({ length: count }, (_, i) => idAt(i)).join(',');

    await request(server()).get('/users').set(auth).expect(422);
    await request(server()).get('/users?ids=').set(auth).expect(422);
    await request(server()).get('/users?ids=not-an-id').set(auth).expect(422);
    await request(server())
      .get(`/users?ids=${many(101)}`)
      .set(auth)
      .expect(422);
    await request(server())
      .get(`/users?ids=${many(100)}`)
      .set(auth)
      .expect(200);
  });

  it('rejects a non-image avatar, accepts a PNG, and serves it via the blob path', async () => {
    const token = await login('alice');

    await request(server())
      .put('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not an image'), 'a.png')
      .expect(422);

    const put = await request(server())
      .put('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pngBytes, 'a.png')
      .expect(200);
    expect(put.body.avatarUrl).toContain('/users/alice/avatar');

    const served = await request(server())
      .get('/users/alice/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(served.headers.etag).toBeDefined();
    expect(served.headers['content-type']).toBe('image/png');

    // The endpoint still requires authentication.
    await request(server()).get('/users/alice/avatar').expect(401);

    await request(server())
      .delete('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(server())
      .get('/users/alice/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('versions avatarUrl with the blob id: stable for the same content, new for a new one', async () => {
    const token = await login('alice');
    const auth = { Authorization: `Bearer ${token}` };
    const upload = async (bytes: Buffer): Promise<string> =>
      (
        await request(server())
          .put('/me/avatar')
          .set(auth)
          .attach('file', bytes, 'a.png')
          .expect(200)
      ).body.avatarUrl as string;

    const first = await upload(pngBytes);
    expect(first).toMatch(/\/users\/alice\/avatar\?v=[^&]+$/);

    // Every emitter carries the same versioned URL.
    const me = await request(server()).get('/me').set(auth).expect(200);
    expect(me.body.avatarUrl).toBe(first);
    const pub = await request(server()).get('/users/alice').set(auth).expect(200);
    expect(pub.body.avatarUrl).toBe(first);

    // Identical content deduplicates to the same blob, hence the same URL.
    expect(await upload(pngBytes)).toBe(first);

    // New content (magic bytes still a PNG) yields a new version.
    const second = await upload(Buffer.concat([pngBytes, Buffer.from('trailing bytes')]));
    expect(second).not.toBe(first);

    // The avatar route ignores `v` and keeps serving.
    const path = new URL(second).pathname + new URL(second).search;
    const served = await request(server()).get(path).set(auth).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toContain('immutable');

    await request(server()).delete('/me/avatar').set(auth).expect(204);
    const cleared = await request(server()).get('/me').set(auth).expect(200);
    expect(cleared.body.avatarUrl).toBeNull();
  });

  // ── #103 pending email ────────────────────────────────────────────────────

  it('exposes a pending email change in GET /me and PATCH /me/profile until it is verified', async () => {
    const token = await login('alice');
    const auth = { Authorization: `Bearer ${token}` };
    const pendingEmail = async (): Promise<string | null> =>
      (await request(server()).get('/me').set(auth).expect(200)).body.pendingEmail;

    // The initial verification row (same address as the account) is not a pending change.
    const alice = (await accounts.findByIdentifier('alice'))!;
    await app.get(EmailVerificationService).startVerification(alice.id, alice.email!);
    expect(await pendingEmail()).toBeNull();

    await request(server())
      .post('/me/email')
      .set(auth)
      .send({ newEmail: 'alice.new@ekoz.example.com', password: 'wrong-password' })
      .expect(401);
    expect(await pendingEmail()).toBeNull();

    await request(server())
      .post('/me/email')
      .set(auth)
      .send({ newEmail: 'Alice.New@ekoz.example.com', password })
      .expect(202);
    expect(await pendingEmail()).toBe('alice.new@ekoz.example.com');

    const patched = await request(server())
      .patch('/me/profile')
      .set(auth)
      .send({ displayName: 'Alice A.' })
      .expect(200);
    expect(patched.body.pendingEmail).toBe('alice.new@ekoz.example.com');

    // Requesting another address replaces the pending one.
    await request(server())
      .post('/me/email')
      .set(auth)
      .send({ newEmail: 'alice.other@ekoz.example.com', password })
      .expect(202);
    expect(await pendingEmail()).toBe('alice.other@ekoz.example.com');

    const mail = [...sentMail].reverse().find((m) => m.template === 'email-verification');
    const verifyToken = new URL(String(mail?.vars.verifyUrl)).searchParams.get('token');
    await request(server()).post('/auth/verify-email').send({ token: verifyToken }).expect(200);

    const verified = await request(server()).get('/me').set(auth).expect(200);
    expect(verified.body.email).toBe('alice.other@ekoz.example.com');
    expect(verified.body.pendingEmail).toBeNull();
  });

  // ── #20 identifier change ─────────────────────────────────────────────────

  it('honours the username change policy', async () => {
    const token = await login('alice');

    // immutable (default)
    await request(server())
      .patch('/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'alice2' })
      .expect(403);

    // available → applies now and reserves the old name
    await config.set('identity.username_change_policy', 'available', null);
    await config.set('identity.username_change_cooldown', 0, null);
    const applied = await request(server())
      .patch('/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'alice-renamed' })
      .expect(200);
    expect(applied.body).toEqual({
      status: 'applied',
      identifier: 'alice-renamed/ekoz.example.com',
    });
    expect(await accounts.findByIdentifier('alice')).toBeNull();
    const reservation = await app.get(AccountService).findByIdentifier('alice-renamed');
    expect(reservation?.name).toBe('alice-renamed');

    // approval → queues a request an owner resolves
    await config.set('identity.username_change_policy', 'approval', null);
    const pending = await request(server())
      .patch('/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'alice-final' })
      .expect(200);
    expect(pending.body.status).toBe('pending');

    const ownerToken = await login('owner');
    const list = await request(server())
      .get('/admin/username-requests?status=pending')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(server())
      .post(`/admin/username-requests/${pending.body.requestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect((await accounts.findByIdentifier('alice-final'))?.name).toBe('alice-final');

    await config.set('identity.username_change_policy', 'immutable', null);
  });

  it('exposes the username change state, allows one pending request and cancels it', async () => {
    const token = await login('alice-final');
    const auth = { Authorization: `Bearer ${token}` };
    const state = async () =>
      (await request(server()).get('/me/username').set(auth).expect(200)).body;
    const ownerAuth = { Authorization: `Bearer ${await login('owner')}` };

    await config.set('identity.username_change_policy', 'approval', null);
    try {
      expect(await state()).toEqual({
        policy: 'approval',
        nextChangeAt: null,
        pendingRequest: null,
      });
      const none = await request(server()).delete('/me/username/request').set(auth).expect(404);
      expect(none.body.code).toBe('identity.username_request_not_found');

      const pending = await request(server())
        .patch('/me/username')
        .set(auth)
        .send({ name: 'alice-wanted' })
        .expect(200);
      const second = await request(server())
        .patch('/me/username')
        .set(auth)
        .send({ name: 'alice-other' })
        .expect(409);
      expect(second.body.code).toBe('identity.username_request_pending');
      expect((await state()).pendingRequest).toMatchObject({
        id: pending.body.requestId,
        requestedName: 'alice-wanted',
      });

      // The pending request stays visible (and cancellable) after a policy change.
      await config.set('identity.username_change_policy', 'immutable', null);
      expect(await state()).toMatchObject({
        policy: 'immutable',
        pendingRequest: { id: pending.body.requestId },
      });

      await request(server()).delete('/me/username/request').set(auth).expect(204);
      expect((await state()).pendingRequest).toBeNull();

      // An owner cannot approve or reject a cancelled request.
      for (const action of ['approve', 'reject']) {
        const refused = await request(server())
          .post(`/admin/username-requests/${pending.body.requestId}/${action}`)
          .set(ownerAuth)
          .expect(409);
        expect(refused.body.code).toBe('identity.username_request_resolved');
      }
      const cancelled = await request(server())
        .get('/admin/username-requests?status=cancelled')
        .set(ownerAuth)
        .expect(200);
      expect(cancelled.body).toHaveLength(1);
      expect(cancelled.body[0]).toMatchObject({
        id: pending.body.requestId,
        status: 'cancelled',
        resolvedByUserId: (await accounts.findByIdentifier('alice-final'))!.id,
      });

      // A new request can be made once the previous one is cancelled.
      await config.set('identity.username_change_policy', 'approval', null);
      await request(server())
        .patch('/me/username')
        .set(auth)
        .send({ name: 'alice-again' })
        .expect(200);
      await request(server()).delete('/me/username/request').set(auth).expect(204);
    } finally {
      await config.set('identity.username_change_policy', 'immutable', null);
    }
  });

  it('reports the cooldown end while `available` changes are rate-limited', async () => {
    await accounts.createAccount({
      name: 'carol',
      email: 'carol@ekoz.example.com',
      password,
      displayName: 'Carol',
      emailVerified: true,
    });
    const auth = { Authorization: `Bearer ${await login('carol')}` };
    const state = async () =>
      (await request(server()).get('/me/username').set(auth).expect(200)).body;

    await config.set('identity.username_change_policy', 'available', null);
    await config.set('identity.username_change_cooldown', 3600, null);
    try {
      expect(await state()).toEqual({
        policy: 'available',
        nextChangeAt: null,
        pendingRequest: null,
      });

      await request(server())
        .patch('/me/username')
        .set(auth)
        .send({ name: 'carol-renamed' })
        .expect(200);
      const after = await state();
      expect(Date.parse(after.nextChangeAt)).toBeGreaterThan(Date.now() + 3_000_000);
      await request(server())
        .patch('/me/username')
        .set(auth)
        .send({ name: 'carol-again' })
        .expect(409);
    } finally {
      await config.set('identity.username_change_policy', 'immutable', null);
      await config.set('identity.username_change_cooldown', 0, null);
    }
  });

  // ── #21 suspension, deletion, owners ──────────────────────────────────────

  it('suspends and unsuspends an account (owner action)', async () => {
    await accounts.createAccount({
      name: 'mallory',
      email: 'mallory@ekoz.example.com',
      password,
      displayName: 'Mallory',
      emailVerified: true,
    });
    const mallory = await login('mallory');
    const ownerToken = await login('owner');
    const mid = (await accounts.findByIdentifier('mallory'))!.id;

    await request(server())
      .post(`/admin/users/${mid}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'spam' })
      .expect(204);

    await request(server()).get('/me').set('Authorization', `Bearer ${mallory}`).expect(403);
    await request(server())
      .post('/auth/login')
      .send({ identifier: 'mallory', password })
      .expect(403);

    await request(server())
      .post(`/admin/users/${mid}/unsuspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(server())
      .post('/auth/login')
      .send({ identifier: 'mallory', password })
      .expect(200);
  });

  it('deletes the own account, scrubbing the profile and freeing nothing yet', async () => {
    await accounts.createAccount({
      name: 'trent',
      email: 'trent@ekoz.example.com',
      password,
      displayName: 'Trent',
      emailVerified: true,
    });
    const token = await login('trent');

    await request(server())
      .delete('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong' })
      .expect(401);
    await request(server())
      .delete('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password })
      .expect(204);

    await request(server()).post('/auth/login').send({ identifier: 'trent', password }).expect(401);
    // The freed identifier is reserved, not immediately reusable.
    const reused = accounts.createAccount({
      name: 'trent',
      email: 'trent2@ekoz.example.com',
      password,
      displayName: 'Trent 2',
    });
    await expect(reused).rejects.toMatchObject({ code: 'identity.username_taken' });
  });

  it('keeps at least one owner', async () => {
    const ownerToken = await login('owner');
    const ownerId = (await accounts.findByIdentifier('owner'))!.id;

    await request(server())
      .delete(`/admin/owners/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    const aliceId = (await accounts.findByIdentifier('alice-final'))!.id;
    await request(server())
      .post('/admin/owners')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: aliceId })
      .expect(204);
    await request(server())
      .delete(`/admin/owners/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
  });

  // ── #22 throttle ─────────────────────────────────────────────────────────

  it('throttles repeated credential attempts with a 429 + Retry-After', async () => {
    await config.set('auth.sensitive_throttle', { window: '15m', max: 3 }, null);
    try {
      for (let i = 0; i < 3; i += 1) {
        await request(server())
          .post('/auth/login')
          .send({ identifier: 'throttle-probe', password: 'nope' })
          .expect(401);
      }
      const limited = await request(server())
        .post('/auth/login')
        .send({ identifier: 'throttle-probe', password: 'nope' })
        .expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.body.code).toBe('auth.too_many_requests');
    } finally {
      await config.set('auth.sensitive_throttle', { window: '15m', max: 10 }, null);
    }
  });
});
