import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Room model and hierarchy (issue #1), end to end against a real database.
 */
describe('conversations — rooms (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
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

  it('rejects a non-owner creating a root space with 403', async () => {
    const aliceToken = await login('alice');
    await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alice space' })
      .expect(403);
  });

  it('creates a root space, a child channel, reads and lists them', async () => {
    const ownerToken = await login('owner');

    const space = await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Engineering', visibility: 'public' })
      .expect(201);
    expect(space.body).toMatchObject({
      type: 'space',
      name: 'Engineering',
      visibility: 'public',
      lastSeq: '0',
    });

    const channel = await request(server())
      .post('/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: space.body.id, name: 'general', visibility: 'public' })
      .expect(201);
    expect(channel.body).toMatchObject({
      type: 'channel',
      parentId: space.body.id,
      name: 'general',
    });

    const got = await request(server())
      .get(`/rooms/${channel.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(got.body.id).toBe(channel.body.id);

    const children = await request(server())
      .get(`/rooms/${space.body.id}/children`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(children.body.map((c: { id: string }) => c.id)).toEqual([channel.body.id]);

    await request(server())
      .get('/rooms/01ARZ3NDEKTSV4RRFFQ69G5FAV')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('rejects a create with an unknown parent with 422, not 404', async () => {
    const ownerToken = await login('owner');

    const space = await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Orphan space', parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })
      .expect(422);
    expect(space.body.code).toBe('room.parent_not_found');

    const channel = await request(server())
      .post('/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', name: 'orphan-channel' })
      .expect(422);
    expect(channel.body.code).toBe('room.parent_not_found');
  });

  it('lets a non-owner read a public room but not a private one', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const publicSpace = await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Public space', visibility: 'public' })
      .expect(201);
    await request(server())
      .get(`/rooms/${publicSpace.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const privateSpace = await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private space', visibility: 'private' })
      .expect(201);
    await request(server())
      .get(`/rooms/${privateSpace.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);
  });

  it('updates a room', async () => {
    const ownerToken = await login('owner');
    const space = await request(server())
      .post('/spaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'To rename', visibility: 'public' })
      .expect(201);

    const updated = await request(server())
      .patch(`/rooms/${space.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Renamed', readOnly: true })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Renamed', readOnly: true });

    // The event only carries the fields the caller actually set (docs/protocol/
    // rooms-and-permissions.md), not the full merged room state.
    const events = (await prisma.orm.public.RoomEvent.where((f) =>
      f.roomId.eq(space.body.id),
    ).all()) as Array<{ type: string; content: Record<string, unknown> }>;
    const roomUpdated = events.find((e) => e.type === 'room_updated');
    expect(roomUpdated?.content).toEqual({ name: 'Renamed', readOnly: true });
  });

  it('moves a room and rejects a cycle', async () => {
    const ownerToken = await login('owner');
    const a = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'A' })
    ).body;
    const b = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'B' })
    ).body;

    const moved = await request(server())
      .post(`/rooms/${b.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: a.id })
      .expect(200);
    expect(moved.body.parentId).toBe(a.id);

    await request(server())
      .post(`/rooms/${a.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: b.id })
      .expect(422);
  });

  it('blocks deleting a room that still has children', async () => {
    const ownerToken = await login('owner');
    const parent = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Parent', visibility: 'public' })
    ).body;
    await request(server())
      .post('/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: parent.id, name: 'child-channel', visibility: 'public' })
      .expect(201);

    await request(server())
      .delete(`/rooms/${parent.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
  });

  it('deletes an empty room', async () => {
    const ownerToken = await login('owner');
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Empty' })
    ).body;

    await request(server())
      .delete(`/rooms/${space.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .get(`/rooms/${space.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
