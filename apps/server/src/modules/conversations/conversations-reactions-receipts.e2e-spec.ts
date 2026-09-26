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

  it('exposes reactions on the message and refuses to react to a deleted one', async () => {
    const ownerToken = await login('owner');
    const ownerId = (await accounts.findByIdentifier('owner'))!.id;
    const channel = await createPublicChannel(ownerToken, 'react-view-room');
    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'react to this' })
      .expect(201);

    await request(server())
      .put(`/messages/${message.body.id}/reactions/%F0%9F%91%8D`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const got = await request(server())
      .get(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(got.body.reactions).toEqual([{ emoji: '👍', userIds: [ownerId] }]);

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const res = await request(server())
      .put(`/messages/${message.body.id}/reactions/%F0%9F%8E%89`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(res.body.code).toBe('message.not_found');
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

  it('lets an inherited space member set and list read markers, and still rejects non-members', async () => {
    const ownerToken = await login('owner');
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'inherited-space', visibility: 'public' })
        .expect(201)
    ).body;
    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'inherited-channel', visibility: 'public' })
        .expect(201)
    ).body;

    await accounts.createAccount({
      name: 'carol',
      email: 'carol@ekoz.example.com',
      password,
      displayName: 'Carol',
      emailVerified: true,
    });
    await accounts.createAccount({
      name: 'dave',
      email: 'dave@ekoz.example.com',
      password,
      displayName: 'Dave',
      emailVerified: true,
    });
    const carolToken = await login('carol');
    const daveToken = await login('dave');
    const carolId = (await accounts.findByIdentifier('carol'))!.id;

    // Carol joins the space only: her access to the channel is inherited.
    await request(server())
      .post(`/rooms/${space.id}/join`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(201);

    const set = await request(server())
      .put(`/rooms/${channel.id}/receipt`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ seq: '3' })
      .expect(200);
    expect(set.body.seq).toBe('3');

    const list = await request(server())
      .get(`/rooms/${channel.id}/receipts`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(200);
    expect(list.body.map((m: { userId: string }) => m.userId)).toContain(carolId);

    // `receipt_updated` reaches the room.
    const events = await request(server())
      .get('/sync')
      .query({ room: channel.id, since: '0' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const receiptEvents = (events.body.events as Array<{ type: string; content: unknown }>).filter(
      (event) => event.type === 'receipt_updated',
    );
    expect(receiptEvents.map((event) => event.content)).toContainEqual({
      userId: carolId,
      seq: '3',
    });

    // A non-member is still rejected on both endpoints.
    const putDenied = await request(server())
      .put(`/rooms/${channel.id}/receipt`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ seq: '3' })
      .expect(403);
    expect(putDenied.body.code).toBe('room.permission_denied');
    await request(server())
      .get(`/rooms/${channel.id}/receipts`)
      .set('Authorization', `Bearer ${daveToken}`)
      .expect(403);
  });
});
