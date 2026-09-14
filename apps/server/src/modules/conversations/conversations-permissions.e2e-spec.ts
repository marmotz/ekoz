import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Capability ACL and resolver (issue #3), end to end against a real database.
 */
describe('conversations — permissions (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;

  const password = 'a-perfectly-fine-passphrase';

  const login = async (identifier: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
  };

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    accounts = app.get(AccountService);
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
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it("returns the caller's default capabilities on a public room", async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Public', visibility: 'public' })
    ).body;

    const mine = await request(server())
      .get(`/rooms/${space.id}/my-permissions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(mine.body.capabilities).toEqual(
      expect.arrayContaining([
        'room.read',
        'room.post',
        'room.edit_own',
        'room.delete_own',
        'room.react',
      ]),
    );
    expect(mine.body.capabilities).not.toContain('space.manage');

    const ownerMine = await request(server())
      .get(`/rooms/${space.id}/my-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerMine.body.capabilities).toContain('space.manage');
  });

  it('rejects a non-privileged user setting an override with 403', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Guarded', visibility: 'public' })
    ).body;

    await request(server())
      .put(`/rooms/${space.id}/permissions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ role: 'member', capability: 'room.pin', effect: 'allow' })
      .expect(403);
  });

  it('a role override changes the effective decision, closest node wins', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Overrides', visibility: 'public' })
    ).body;
    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'general', visibility: 'public' })
    ).body;

    // member has room.post by default; deny it on the space...
    await request(server())
      .put(`/rooms/${space.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'member', capability: 'room.post', effect: 'deny' })
      .expect(204);

    const afterSpaceDeny = await request(server())
      .get(`/rooms/${channel.id}/my-permissions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(afterSpaceDeny.body.capabilities).not.toContain('room.post');

    // ... then re-allow it on the channel itself: the closer node wins.
    await request(server())
      .put(`/rooms/${channel.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'member', capability: 'room.post', effect: 'allow' })
      .expect(204);

    const afterChannelAllow = await request(server())
      .get(`/rooms/${channel.id}/my-permissions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(afterChannelAllow.body.capabilities).toContain('room.post');
  });

  it('a per-user override beats a same-node role override', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const alice = (await accounts.findByIdentifier('alice'))!;

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Per user', visibility: 'public' })
    ).body;

    await request(server())
      .put(`/rooms/${space.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'member', capability: 'room.pin', effect: 'deny' })
      .expect(204);

    await request(server())
      .put(`/rooms/${space.id}/members/${alice.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capability: 'room.pin', effect: 'allow' })
      .expect(204);

    const mine = await request(server())
      .get(`/rooms/${space.id}/my-permissions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(mine.body.capabilities).toContain('room.pin');
  });
});
