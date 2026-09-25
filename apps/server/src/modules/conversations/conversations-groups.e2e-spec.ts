import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/** Room groups (web-client-mentions technical.md S4), end to end against a real database. */
describe('conversations — room groups (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();
  const unknownId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  const login = async (identifier: string): Promise<string> => {
    const res = await request(server())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
  };

  const createSpace = async (token: string, name: string, parentId?: string) =>
    (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name, visibility: 'public', ...(parentId ? { parentId } : {}) })
        .expect(201)
    ).body;

  const createChannel = async (token: string, parentId: string, name: string) =>
    (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId, name, visibility: 'public' })
        .expect(201)
    ).body;

  const join = (token: string, roomId: string) =>
    request(server()).post(`/rooms/${roomId}/join`).set('Authorization', `Bearer ${token}`);

  const createGroup = (token: string, roomId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/rooms/${roomId}/groups`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const groupMembers = async (groupId: string): Promise<string[]> =>
    (
      (await prisma.orm.public.RoomGroupMember.where({ groupId }).all()) as Array<{
        userId: string;
      }>
    ).map((row) => row.userId);

  const groupEvents = async (roomId: string) =>
    (
      (await prisma.orm.public.RoomEvent.where({
        roomId,
        type: 'group_changed',
      }).all()) as Array<{ content: Record<string, unknown> }>
    ).map((row) => row.content);

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
    for (const name of ['alice', 'bob', 'carol']) {
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

  it('creates, lists, reads, renames and deletes a group, and emits group_changed', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const bob = (await accounts.findByIdentifier('bob'))!;
    const space = await createSpace(ownerToken, 'crud-space');
    const channel = await createChannel(ownerToken, space.id, 'crud-room');
    await join(aliceToken, channel.id).expect(201);
    await join(await login('bob'), channel.id).expect(201);

    const created = await createGroup(ownerToken, channel.id, {
      name: 'devs',
      memberIds: [alice.id],
    }).expect(201);
    expect(created.body).toMatchObject({
      nodeId: channel.id,
      name: 'devs',
      memberCount: 1,
      inherited: false,
      isMember: false,
    });
    expect(created.body.members.map((m: { id: string }) => m.id)).toEqual([alice.id]);
    const groupId = created.body.id as string;

    const asAlice = await request(server())
      .get(`/rooms/${channel.id}/groups`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(asAlice.body.items).toEqual([
      {
        id: groupId,
        nodeId: channel.id,
        name: 'devs',
        memberCount: 1,
        inherited: false,
        isMember: true,
      },
    ]);

    await request(server())
      .put(`/rooms/${channel.id}/groups/${groupId}/members/${bob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    // Idempotent: no second event.
    await request(server())
      .put(`/rooms/${channel.id}/groups/${groupId}/members/${bob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const detail = await request(server())
      .get(`/rooms/${channel.id}/groups/${groupId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(detail.body.memberCount).toBe(2);
    expect(detail.body.members.map((m: { id: string }) => m.id).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );

    const notMember = await request(server())
      .put(`/rooms/${channel.id}/groups/${groupId}/members/${unknownId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(422);
    expect(notMember.body.code).toBe('group.member_not_member');

    await request(server())
      .delete(`/rooms/${channel.id}/groups/${groupId}/members/${bob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(server())
      .delete(`/rooms/${channel.id}/groups/${groupId}/members/${bob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const renamed = await request(server())
      .patch(`/rooms/${channel.id}/groups/${groupId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'engineers' })
      .expect(200);
    expect(renamed.body.name).toBe('engineers');

    await request(server())
      .delete(`/rooms/${channel.id}/groups/${groupId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const gone = await request(server())
      .get(`/rooms/${channel.id}/groups/${groupId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(gone.body.code).toBe('group.not_found');
    expect(await groupMembers(groupId)).toEqual([]);

    expect(await groupEvents(channel.id)).toEqual([
      { groupId, change: 'created', name: 'devs' },
      { groupId, change: 'member_added', name: 'devs', userId: bob.id },
      { groupId, change: 'member_removed', name: 'devs', userId: bob.id },
      { groupId, change: 'renamed', name: 'engineers' },
      { groupId, change: 'deleted', name: 'engineers' },
    ]);
  });

  it('validates names and reserves `all` and the role names', async () => {
    const ownerToken = await login('owner');
    const space = await createSpace(ownerToken, 'names-space');
    const channel = await createChannel(ownerToken, space.id, 'names-room');

    await createGroup(ownerToken, channel.id, { name: 'Not Valid' }).expect(422);
    await createGroup(ownerToken, channel.id, { name: 'x'.repeat(33) }).expect(422);
    for (const name of ['all', 'space_admin', 'room_admin', 'moderator', 'member', 'reader']) {
      const res = await createGroup(ownerToken, channel.id, { name }).expect(422);
      expect(res.body.code).toBe('group.name_reserved');
    }

    const ok = await createGroup(ownerToken, channel.id, { name: 'ok' }).expect(201);
    const reservedRename = await request(server())
      .patch(`/rooms/${channel.id}/groups/${ok.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'all' })
      .expect(422);
    expect(reservedRename.body.code).toBe('group.name_reserved');
  });

  it('gates writes on room.manage_groups, on the group node', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const space = await createSpace(ownerToken, 'perm-space');
    const channel = await createChannel(ownerToken, space.id, 'perm-room');
    await join(aliceToken, channel.id).expect(201);

    await createGroup(aliceToken, channel.id, { name: 'nope' }).expect(403);

    await request(server())
      .patch(`/rooms/${channel.id}/members/${alice.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'room_admin' })
      .expect(200);
    await createGroup(aliceToken, channel.id, { name: 'mine' }).expect(201);

    const inherited = await createGroup(ownerToken, space.id, { name: 'space-wide' }).expect(201);
    const fromChannel = await request(server())
      .get(`/rooms/${channel.id}/groups`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(fromChannel.body.items.map((g: { name: string }) => g.name)).toEqual([
      'mine',
      'space-wide',
    ]);
    expect(
      fromChannel.body.items.find((g: { name: string }) => g.name === 'space-wide').inherited,
    ).toBe(true);

    // The write is checked on the group's node (the space), not on the channel.
    await request(server())
      .patch(`/rooms/${channel.id}/groups/${inherited.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'renamed' })
      .expect(403);
    await request(server())
      .delete(`/rooms/${channel.id}/groups/${inherited.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);

    // A group is not on or above an unrelated room.
    const other = await createChannel(ownerToken, space.id, 'perm-other');
    const own = await createGroup(ownerToken, channel.id, { name: 'channel-only' }).expect(201);
    const notFound = await request(server())
      .get(`/rooms/${other.id}/groups/${own.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(notFound.body.code).toBe('group.not_found');
  });

  it('keeps names unique over the ancestor and descendant chain, including on move', async () => {
    const ownerToken = await login('owner');
    const space = await createSpace(ownerToken, 'chain-space');
    const channelA = await createChannel(ownerToken, space.id, 'chain-a');
    const channelB = await createChannel(ownerToken, space.id, 'chain-b');

    await createGroup(ownerToken, space.id, { name: 'up' }).expect(201);
    // Ancestor conflict.
    const ancestor = await createGroup(ownerToken, channelA.id, { name: 'up' }).expect(409);
    expect(ancestor.body.code).toBe('group.name_taken');
    // Descendant conflict.
    await createGroup(ownerToken, channelA.id, { name: 'leaf' }).expect(201);
    const descendant = await createGroup(ownerToken, space.id, { name: 'leaf' }).expect(409);
    expect(descendant.body.code).toBe('group.name_taken');
    // Siblings are not on one chain.
    await createGroup(ownerToken, channelB.id, { name: 'leaf' }).expect(201);

    // Rename conflict.
    const other = await createGroup(ownerToken, channelA.id, { name: 'other' }).expect(201);
    await request(server())
      .patch(`/rooms/${channelA.id}/groups/${other.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'up' })
      .expect(409);
    await request(server())
      .patch(`/rooms/${channelA.id}/groups/${other.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'other' })
      .expect(200);

    // Move conflict: a group in the moved subtree against one on the new ancestors.
    const target = await createSpace(ownerToken, 'move-target');
    await createGroup(ownerToken, target.id, { name: 'clash' }).expect(201);
    const movable = await createSpace(ownerToken, 'move-source');
    const movableChannel = await createChannel(ownerToken, movable.id, 'move-channel');
    await createGroup(ownerToken, movableChannel.id, { name: 'clash' }).expect(201);

    const refused = await request(server())
      .post(`/rooms/${movable.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: target.id })
      .expect(409);
    expect(refused.body.code).toBe('group.name_taken');

    await createGroup(ownerToken, movableChannel.id, { name: 'fine' }).expect(201);
    const clash = (
      await request(server())
        .get(`/rooms/${movableChannel.id}/groups`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
    ).body.items.find((g: { name: string }) => g.name === 'clash');
    await request(server())
      .patch(`/rooms/${movableChannel.id}/groups/${clash.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'no-clash' })
      .expect(200);
    await request(server())
      .post(`/rooms/${movable.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: target.id })
      .expect(200);
  });

  it('drops a user from the groups of the node and its descendants on leave, kick and ban', async () => {
    const ownerToken = await login('owner');
    const bobToken = await login('bob');
    const carolToken = await login('carol');
    const aliceToken = await login('alice');
    const bob = (await accounts.findByIdentifier('bob'))!;
    const carol = (await accounts.findByIdentifier('carol'))!;
    const alice = (await accounts.findByIdentifier('alice'))!;
    const space = await createSpace(ownerToken, 'cleanup-space');
    const channel = await createChannel(ownerToken, space.id, 'cleanup-room');
    for (const token of [bobToken, carolToken, aliceToken]) {
      await join(token, space.id).expect(201);
      await join(token, channel.id).expect(201);
    }

    const spaceGroup = (
      await createGroup(ownerToken, space.id, {
        name: 'space-group',
        memberIds: [bob.id, carol.id, alice.id],
      }).expect(201)
    ).body.id as string;
    const channelGroup = (
      await createGroup(ownerToken, channel.id, {
        name: 'channel-group',
        memberIds: [bob.id, carol.id, alice.id],
      }).expect(201)
    ).body.id as string;

    // Leaving the channel only touches groups on the channel.
    await request(server())
      .post(`/rooms/${channel.id}/leave`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(204);
    expect((await groupMembers(channelGroup)).sort()).toEqual([carol.id, alice.id].sort());
    expect((await groupMembers(spaceGroup)).length).toBe(3);

    // Leaving the space also clears the descendant channel's groups.
    await request(server())
      .post(`/rooms/${space.id}/leave`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(204);
    expect(await groupMembers(channelGroup)).toEqual([alice.id]);
    expect((await groupMembers(spaceGroup)).sort()).toEqual([bob.id, alice.id].sort());

    // Kick.
    await request(server())
      .delete(`/rooms/${space.id}/members/${alice.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    expect(await groupMembers(channelGroup)).toEqual([]);
    expect(await groupMembers(spaceGroup)).toEqual([bob.id]);

    // Ban.
    await request(server())
      .post(`/rooms/${space.id}/bans`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: bob.id })
      .expect(204);
    expect(await groupMembers(spaceGroup)).toEqual([]);
  });
});
