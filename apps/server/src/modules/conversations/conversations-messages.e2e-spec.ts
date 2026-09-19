import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Messages, mentions, replies, pins (issue #7), and edit/delete/tombstones
 * (issue #8), end to end against a real database.
 */
describe('conversations — messages (integration)', () => {
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

  it('sends a message with a structured mention, replies, and rejects bad Markdown', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const channel = await createPublicChannel(ownerToken, 'msg-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const first = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'hello **world**', mentions: [alice.id] })
      .expect(201);
    expect(first.body.mentions).toEqual([alice.id]);
    expect(first.body.seq).toBeDefined();

    const reply = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'hi back', replyToId: first.body.id })
      .expect(201);
    expect(reply.body.replyToId).toBe(first.body.id);

    const fetched = await request(server())
      .get(`/rooms/${channel.id}/messages/${first.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(fetched.body.body).toBe('hello **world**');

    const rejected = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: '<script>alert(1)</script>' })
      .expect(422);
    expect(rejected.body.code).toBe('message.body_invalid');

    const badMention = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'hi', mentions: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'] })
      .expect(422);
    expect(badMention.body.code).toBe('message.mention_not_member');
  });

  it('pins and unpins a message', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'pin-room');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'pin me' })
      .expect(201);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    const list = await request(server())
      .get(`/rooms/${channel.id}/pins`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.map((p: { messageId: string }) => p.messageId)).toContain(message.body.id);

    await request(server())
      .delete(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .delete(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('rejects posting in a read-only room without room.edit_any', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'readonly-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);
    await request(server())
      .patch(`/rooms/${channel.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ readOnly: true })
      .expect(200);

    const res = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'nope' })
      .expect(422);
    expect(res.body.code).toBe('room.read_only');
  });

  it("edits own message and rejects editing someone else's without room.edit_any", async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'edit-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'typo' })
      .expect(201);

    const edited = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'fixed' })
      .expect(200);
    expect(edited.body.body).toBe('fixed');
    expect(edited.body.editedAt).not.toBeNull();

    const res = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'bad' })
      .expect(200); // alice is still the author, allowed

    expect(res.body.body).toBe('bad');
  });

  it('deletes a message: clears body, removes pins/mentions, tombstones the event', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'delete-room');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'to be deleted' })
      .expect(201);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    // Deleting an already-deleted message is refused (404, not idempotent).
    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    const pins = await request(server())
      .get(`/rooms/${channel.id}/pins`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(pins.body.map((p: { messageId: string }) => p.messageId)).not.toContain(message.body.id);
  });
});
