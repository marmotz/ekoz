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

  // Logins are rate limited: one token per account for the whole file.
  const tokens = new Map<string, string>();
  const login = async (identifier: string): Promise<string> => {
    const cached = tokens.get(identifier);
    if (cached) {
      return cached;
    }

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);
    tokens.set(identifier, res.body.accessToken as string);

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
    for (const name of ['bob', 'carol', 'dave', 'erin']) {
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
      // `room_created` then the creator's `member_joined`.
      lastSeq: '2',
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

  it('drops every outdated closure row of the moved subtree', async () => {
    const ownerToken = await login('owner');
    const create = async (body: Record<string, unknown>) =>
      (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(body)
          .expect(201)
      ).body as { id: string };
    const a = await create({ name: 'ClosureA' });
    const b = await create({ name: 'ClosureB', parentId: a.id });
    const c = await create({ name: 'ClosureC', parentId: b.id });

    await request(server())
      .post(`/rooms/${b.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: null })
      .expect(200);

    // Both (A, B) and (A, C) are stale: a single-row delete would keep one.
    const rows = (await prisma.orm.public.RoomClosure.where((f) =>
      f.ancestorId.eq(a.id),
    ).all()) as Array<{ descendantId: string }>;
    expect(rows.map((r) => r.descendantId)).toEqual([a.id]);
    expect(c.id).toBeDefined();
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

  describe('creator membership', () => {
    const membersOf = async (roomId: string) =>
      (
        (await prisma.orm.public.Membership.where({ roomId }).all()) as Array<{
          userId: string;
          role: string;
          invitedById: string | null;
        }>
      ).map((m) => ({ userId: m.userId, role: m.role, invitedById: m.invitedById }));

    const eventsOf = async (roomId: string) =>
      (
        (await prisma.orm.public.RoomEvent.where({ roomId })
          .orderBy((f) => f.seq.asc())
          .all()) as Array<{ seq: bigint; type: string; senderId: string | null; content: unknown }>
      ).map((e) => ({
        seq: Number(e.seq),
        type: e.type,
        senderId: e.senderId,
        content: e.content,
      }));

    const meId = async (token: string): Promise<string> =>
      (await request(server()).get('/me').set('Authorization', `Bearer ${token}`).expect(200)).body
        .id as string;

    it('makes an owner creating a root space its space_admin', async () => {
      const ownerToken = await login('owner');
      const ownerId = await meId(ownerToken);

      const space = (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ name: 'Owner root space' })
          .expect(201)
      ).body;

      expect(await membersOf(space.id)).toEqual([
        { userId: ownerId, role: 'space_admin', invitedById: null },
      ]);
    });

    it('emits room_created then member_joined with consecutive seq values', async () => {
      const ownerToken = await login('owner');
      const ownerId = await meId(ownerToken);

      const space = (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ name: 'Ordered events' })
          .expect(201)
      ).body;

      expect(await eventsOf(space.id)).toEqual([
        {
          seq: 1,
          type: 'room_created',
          senderId: ownerId,
          content: { type: 'space', parentId: null, visibility: 'private', name: 'Ordered events' },
        },
        {
          seq: 2,
          type: 'member_joined',
          senderId: ownerId,
          content: { userId: ownerId, role: 'space_admin' },
        },
      ]);
    });

    it('makes the creator of a channel its room_admin and lets them leave', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const aliceId = await meId(aliceToken);

      const space = (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ name: 'Delegated space', visibility: 'public' })
          .expect(201)
      ).body;
      await request(server())
        .post(`/rooms/${space.id}/join`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(201);
      await request(server())
        .patch(`/rooms/${space.id}/members/${aliceId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'space_admin' })
        .expect(200);

      const channel = (
        await request(server())
          .post('/rooms')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ parentId: space.id, name: 'alice-channel' })
          .expect(201)
      ).body;

      expect(await membersOf(channel.id)).toEqual([
        { userId: aliceId, role: 'room_admin', invitedById: null },
      ]);
      expect((await eventsOf(channel.id)).map((e) => e.type)).toEqual([
        'room_created',
        'member_joined',
      ]);

      await request(server())
        .post(`/rooms/${channel.id}/leave`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(204);
      expect(await membersOf(channel.id)).toEqual([]);
    });
  });

  describe('GET /rooms', () => {
    type ListItem = { id: string; parentId: string | null; role: string | null; access: string };

    const listRooms = async (token: string): Promise<ListItem[]> =>
      (await request(server()).get('/rooms').set('Authorization', `Bearer ${token}`).expect(200))
        .body.items as ListItem[];

    const createSpace = async (token: string, name: string, parentId?: string) =>
      (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${token}`)
          .send({ name, ...(parentId && { parentId }) })
          .expect(201)
      ).body as { id: string };

    const createChannel = async (
      token: string,
      name: string,
      parentId: string,
      visibility = 'private',
    ) =>
      (
        await request(server())
          .post('/rooms')
          .set('Authorization', `Bearer ${token}`)
          .send({ name, parentId, visibility })
          .expect(201)
      ).body as { id: string };

    const userIdOf = async (name: string): Promise<string> =>
      (await accounts.findByIdentifier(name))?.id as string;

    /** Owner invites `name` to `roomId` with `role`, `name` accepts. */
    const addMember = async (name: string, roomId: string, role = 'member') => {
      const ownerToken = await login('owner');
      const invitation = await request(server())
        .post(`/rooms/${roomId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: await userIdOf(name), role })
        .expect(201);
      await request(server())
        .post(`/invitations/${invitation.body.id}/accept`)
        .set('Authorization', `Bearer ${await login(name)}`)
        .expect(201);
    };

    const pick = (items: ListItem[]) =>
      items.map(({ id, parentId, role, access }) => ({ id, parentId, role, access }));

    it('requires authentication', async () => {
      await request(server()).get('/rooms').expect(401);
    });

    it('answers an empty list for a user without rooms', async () => {
      expect(await listRooms(await login('dave'))).toEqual([]);
    });

    it('lists direct, inherited and context rooms in creation order', async () => {
      const ownerToken = await login('owner');
      const root = await createSpace(ownerToken, 'List root');
      const team = await createSpace(ownerToken, 'List team', root.id);
      const teamGeneral = await createChannel(ownerToken, 'team-general', team.id);
      const teamRandom = await createChannel(ownerToken, 'team-random', team.id);
      await createChannel(ownerToken, 'root-only', root.id);
      const other = await createSpace(ownerToken, 'List other');
      const lone = await createChannel(ownerToken, 'lone', other.id, 'public');
      await createChannel(ownerToken, 'other-unrelated', other.id, 'public');

      await addMember('bob', team.id);
      await request(server())
        .post(`/rooms/${lone.id}/join`)
        .set('Authorization', `Bearer ${await login('bob')}`)
        .expect(201);

      expect(pick(await listRooms(await login('bob')))).toEqual([
        { id: root.id, parentId: null, role: null, access: 'context' },
        { id: team.id, parentId: root.id, role: 'member', access: 'member' },
        { id: teamGeneral.id, parentId: team.id, role: 'member', access: 'inherited' },
        { id: teamRandom.id, parentId: team.id, role: 'member', access: 'inherited' },
        { id: other.id, parentId: null, role: null, access: 'context' },
        { id: lone.id, parentId: other.id, role: 'member', access: 'member' },
      ]);
    });

    it('returns every Room field on each item', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'Shape space');
      const [item] = (await listRooms(ownerToken)).filter((i) => i.id === space.id);

      expect(item).toEqual({
        id: space.id,
        type: 'space',
        parentId: null,
        visibility: 'private',
        slug: null,
        name: 'Shape space',
        topic: null,
        avatarBlobId: null,
        defaultRole: 'member',
        readOnly: false,
        originServer: expect.any(String),
        lastSeq: '2',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        role: 'space_admin',
        access: 'member',
      });
    });

    it("lists a root space its owner created, with the creator's role", async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'Owner listed space');

      const items = await listRooms(ownerToken);
      expect(items.find((i) => i.id === space.id)).toMatchObject({
        role: 'space_admin',
        access: 'member',
      });
    });

    it('excludes dm and group_dm rooms', async () => {
      const carolToken = await login('carol');
      const dm = await request(server())
        .post('/dms')
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ userId: await userIdOf('erin') })
        .expect(201);

      const ids = (await listRooms(carolToken)).map((i) => i.id);
      expect(ids).not.toContain(dm.body.id);
      expect(await listRooms(await login('erin'))).toEqual([]);
    });

    it('excludes a deleted room and the context it no longer needs', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'Deleted parent');
      const channel = await createChannel(ownerToken, 'to-delete', space.id);
      await addMember('carol', channel.id);
      expect((await listRooms(await login('carol'))).map((i) => i.id)).toEqual(
        expect.arrayContaining([space.id, channel.id]),
      );

      await request(server())
        .delete(`/rooms/${channel.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const ids = (await listRooms(await login('carol'))).map((i) => i.id);
      expect(ids).not.toContain(channel.id);
      expect(ids).not.toContain(space.id);
    });

    it('lists nested spaces down to rooms.max_depth, the nearest membership giving the role', async () => {
      const ownerToken = await login('owner');
      const depth0 = await createSpace(ownerToken, 'Depth 0');
      const depth1 = await createSpace(ownerToken, 'Depth 1', depth0.id);
      const depth2 = await createSpace(ownerToken, 'Depth 2', depth1.id);
      const depth3 = await createSpace(ownerToken, 'Depth 3', depth2.id);
      const depth4 = await createSpace(ownerToken, 'Depth 4', depth3.id);
      const tooDeep = await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Too deep', parentId: depth4.id })
        .expect(422);
      expect(tooDeep.body.code).toBe('room.max_depth_exceeded');

      await addMember('alice', depth1.id, 'reader');
      await addMember('alice', depth2.id, 'moderator');

      const items = (await listRooms(await login('alice'))).filter((i) =>
        [depth0.id, depth1.id, depth2.id, depth3.id, depth4.id].includes(i.id),
      );
      expect(pick(items)).toEqual([
        { id: depth0.id, parentId: null, role: null, access: 'context' },
        { id: depth1.id, parentId: depth0.id, role: 'reader', access: 'member' },
        { id: depth2.id, parentId: depth1.id, role: 'moderator', access: 'member' },
        { id: depth3.id, parentId: depth2.id, role: 'moderator', access: 'inherited' },
        { id: depth4.id, parentId: depth3.id, role: 'moderator', access: 'inherited' },
      ]);
    });
  });
});
