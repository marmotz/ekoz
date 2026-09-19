import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { expectAuditEntry } from '../../core/audit/testing/audit-assertions.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Local moderation surface (issue #13): kick/ban/unban/delete-any also write
 * an `audit_log` entry, and `GET /rooms/:id/moderation-log` exposes them.
 */
describe('conversations — moderation (integration)', () => {
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
    for (const name of ['alice', 'bob']) {
      await accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName: name,
        emailVerified: true,
      });
    }
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('kick writes a moderation audit entry in addition to the room_event', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'mod-kick');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    await request(server())
      .delete(`/rooms/${channel.id}/members/${await userId('alice')}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const row = await expectAuditEntry({ orm: database.db.orm }, 'moderation.kick', {
      targetType: 'room',
      targetId: channel.id,
    });
    expect(row.metadata).toMatchObject({ userId: await userId('alice') });

    const sync = await request(server())
      .get(`/sync?room=${channel.id}&since=0`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(sync.body.events.some((e: { type: string }) => e.type === 'member_kicked')).toBe(true);
  });

  it('ban and unban each write their own moderation audit entry', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'mod-ban');
    const bobId = await userId('bob');

    await request(server())
      .post(`/rooms/${channel.id}/bans`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: bobId, reason: 'spam' })
      .expect(204);

    const banRow = await expectAuditEntry({ orm: database.db.orm }, 'moderation.ban', {
      targetType: 'room',
      targetId: channel.id,
    });
    expect(banRow.metadata).toMatchObject({ userId: bobId, reason: 'spam' });

    await request(server())
      .delete(`/rooms/${channel.id}/bans/${bobId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const unbanRow = await expectAuditEntry({ orm: database.db.orm }, 'moderation.unban', {
      targetType: 'room',
      targetId: channel.id,
    });
    expect(unbanRow.metadata).toMatchObject({ userId: bobId });
  });

  it('deleting someone else’s message audits moderation.delete_message; self-delete does not', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'mod-delete');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const aliceMessage = (
      await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ body: 'hello from alice' })
    ).body;

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${aliceMessage.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const row = await expectAuditEntry({ orm: database.db.orm }, 'moderation.delete_message', {
      targetType: 'room',
      targetId: channel.id,
    });
    expect(row.metadata).toMatchObject({
      messageId: aliceMessage.id,
      authorId: await userId('alice'),
    });

    const ownMessage = (
      await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ body: 'deleting my own message' })
    ).body;

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${ownMessage.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    // Only one delete_message entry exists — the moderation one above, not this self-delete.
    const rows = await database.db.orm.public.AuditLog.where((f) =>
      f.action.eq('moderation.delete_message'),
    ).all();
    expect(rows).toHaveLength(1);
  });

  it('GET moderation-log needs a moderation capability and returns room-scoped entries', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'mod-log');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    // A plain member has no moderation capability on this room.
    await request(server())
      .get(`/rooms/${channel.id}/moderation-log`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);

    await request(server())
      .post(`/rooms/${channel.id}/bans`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: await userId('bob') })
      .expect(204);

    const log = await request(server())
      .get(`/rooms/${channel.id}/moderation-log`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(log.body).toHaveLength(1);
    expect(log.body[0]).toMatchObject({ action: 'moderation.ban', targetId: channel.id });
  });

  async function userId(name: string): Promise<string> {
    const token = await login(name);
    const res = await request(server()).get('/me').set('Authorization', `Bearer ${token}`);
    return res.body.id as string;
  }
});
