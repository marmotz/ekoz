import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from './accounts/account.service.js';
import { IdentifierService } from './accounts/identifier.service.js';

describe('identity — accounts, auth, sessions (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;

  const password = 'correct horse battery staple';

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    await app.get(AccountService).createAccount({
      name: 'alice',
      email: 'Alice@Example.com',
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

  it('IdentifierService.isAvailable reflects the held name and reservations', async () => {
    const identifiers = app.get(IdentifierService);
    expect(await identifiers.isAvailable('alice')).toBe(false);
    expect(await identifiers.isAvailable('bob')).toBe(true);
  });

  it('rejects a duplicate identifier / email', async () => {
    await expect(
      app
        .get(AccountService)
        .createAccount({ name: 'alice', email: 'x@y.co', password, displayName: 'X' }),
    ).rejects.toMatchObject({ code: 'identity.username_taken' });
  });

  it('logs in with the bare name, the full name/server, and the email', async () => {
    for (const identifier of ['alice', 'alice/ekoz.example.com', 'alice@example.com']) {
      const res = await request(server())
        .post('/auth/login')
        .send({ identifier, password })
        .expect(200);
      expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(res.body.refreshToken).toBeTypeOf('string');
      expect(res.body.session).toMatchObject({ current: true, deviceName: expect.any(String) });
    }
  });

  it('rejects a wrong password and an unknown identifier the same way', async () => {
    await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password: 'nope' })
      .expect(401);
    await request(server())
      .post('/auth/login')
      .send({ identifier: 'ghost', password: 'nope' })
      .expect(401);
  });

  it('derives a device name from the User-Agent when none is given', async () => {
    const res = await request(server())
      .post('/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36')
      .send({ identifier: 'alice', password })
      .expect(200);
    expect(res.body.session.deviceName).toBe('Chrome on Windows');
  });

  it('guards a protected route and accepts a valid access token', async () => {
    await request(server()).get('/sessions').expect(401);

    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password })
      .expect(200);
    const list = await request(server())
      .get('/sessions')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
  });

  it('rotates the refresh token and detects reuse', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password, deviceName: 'Rotation test' })
      .expect(200);
    const first = login.body.refreshToken;

    const rotated = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(first);
    expect(rotated.body.accessToken).toBeTypeOf('string');

    // Replaying the consumed token trips reuse detection and kills the session.
    const reuse = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);
    expect(reuse.body.code ?? reuse.body.type).toContain('refresh_reuse');

    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('renames and revokes sessions, and revokes all others', async () => {
    const a = await login('Session A');
    const b = await login('Session B');
    await login('Session C');

    const renamed = await request(server())
      .patch(`/sessions/${b.sessionId}`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ deviceName: 'Renamed B' })
      .expect(200);
    expect(renamed.body.deviceName).toBe('Renamed B');

    await request(server())
      .delete(`/sessions/${a.sessionId}`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(204);

    const bulk = await request(server())
      .delete('/sessions?all=true')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(200);
    expect(bulk.body.revoked).toBeGreaterThanOrEqual(1);

    // b's own access token still lists, and only b remains active.
    const remaining = await request(server())
      .get('/sessions')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(200);
    const active = remaining.body.filter((s: { revokedAt: string | null }) => s.revokedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.sessionId);
  });

  it('logout revokes the current session and blocks its access token', async () => {
    const s = await login('Logout test');
    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(204);
    await request(server())
      .get('/sessions')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(401);
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
  });

  async function login(deviceName: string): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }> {
    const res = await request(server())
      .post('/auth/login')
      .send({ identifier: 'alice', password, deviceName })
      .expect(200);

    return {
      accessToken: res.body.accessToken,
      refreshToken: res.body.refreshToken,
      sessionId: res.body.session.id,
    };
  }
});
