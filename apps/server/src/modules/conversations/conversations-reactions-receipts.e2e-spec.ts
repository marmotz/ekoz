import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Reactions and read markers (issue #9), end to end against a real database.
 */
describe('conversations — reactions and receipts (integration)', () => {
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

  it('adds and removes a reaction', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'react-room');
    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'react to this' })
      .expect(201);

    await request(server())
      .put(`/messages/${message.body.id}/reactions/%F0%9F%91%8D`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .put(`/messages/${message.body.id}/reactions/%F0%9F%91%8D`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    await request(server())
      .delete(`/messages/${message.body.id}/reactions/%F0%9F%91%8D`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .delete(`/messages/${message.body.id}/reactions/%F0%9F%91%8D`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('sets a monotonic read marker, visible to participants only', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'receipt-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);
    await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'hi' })
      .expect(201);

    const set = await request(server())
      .put(`/rooms/${channel.id}/receipt`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ seq: '5' })
      .expect(200);
    expect(set.body.seq).toBe('5');

    // Monotonic: a lower seq is ignored.
    const ignored = await request(server())
      .put(`/rooms/${channel.id}/receipt`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ seq: '1' })
      .expect(200);
    expect(ignored.body.seq).toBe('5');

    const list = await request(server())
      .get(`/rooms/${channel.id}/receipts`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(list.body.map((m: { userId: string }) => m.userId)).toContain(
      (await accounts.findByIdentifier('alice'))!.id,
    );

    const bobToken = await (async () => {
      await accounts.createAccount({
        name: 'bob',
        email: 'bob@ekoz.example.com',
        password,
        displayName: 'bob',
        emailVerified: true,
      });
      return login('bob');
    })();

    const res = await request(server())
      .get(`/rooms/${channel.id}/receipts`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
    expect(res.body.code).toBe('room.permission_denied');
  });
});
