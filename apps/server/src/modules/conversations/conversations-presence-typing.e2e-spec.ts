import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Presence heartbeats and typing signals (issue #10), end to end against a
 * real database.
 */
describe('conversations — presence and typing (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();

  const login = async (identifier: string): Promise<string> => {
    const res = await request(server())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
  };

  const createPublicChannel = async (ownerToken: string, name: string) => {
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `${name}-space`, visibility: 'public' })
    ).body;

    return (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name, visibility: 'public' })
    ).body;
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

  it('heartbeat reports online, and an explicit away flag reports away', async () => {
    const ownerToken = await login('owner');

    const online = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(201);
    expect(online.body.status).toBe('online');

    const away = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ away: true })
      .expect(201);
    expect(away.body.status).toBe('away');
  });

  it('broadcasts a typing signal, needs room.post', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'typing-room');

    await request(server())
      .post(`/rooms/${channel.id}/typing`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    // A private channel Alice has no membership on: no room.post, so no typing.
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'private-typing-space', visibility: 'private' })
    ).body;
    const privateChannel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'private-typing', visibility: 'private' })
    ).body;

    const res = await request(server())
      .post(`/rooms/${privateChannel.id}/typing`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);
    expect(res.body.code).toBe('room.permission_denied');
  });
});
