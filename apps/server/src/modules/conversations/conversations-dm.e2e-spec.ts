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
 * Direct and group conversations (issue #5), end to end against a real
 * database.
 */
describe('conversations — dm (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();

  const login = async (identifier: string): Promise<string> => {
    const res = await request(server())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);

    return res.body.accessToken as string;
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
    prisma = app.get(PrismaService);
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

  it('deduplicates a dm regardless of caller order, and hide-leaves keep membership', async () => {
    const aliceToken = await login('alice');
    const bobToken = await login('bob');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const bob = (await accounts.findByIdentifier('bob'))!;

    const first = await request(server())
      .post('/dms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: bob.id })
      .expect(201);
    expect(first.body.type).toBe('dm');

    const second = await request(server())
      .post('/dms')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ userId: alice.id })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);

    await request(server())
      .post('/dms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: alice.id })
      .expect(422);

    // "Leaving" a dm hides it but does not remove membership: the room stays
    // readable and posting still works.
    await request(server())
      .post(`/rooms/${first.body.id}/leave`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    await request(server())
      .get(`/rooms/${first.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
  });

  it('deleting a dm raises the history floor; a new message brings it back without the past', async () => {
    const aliceToken = await login('alice');
    const carol = await accounts.createAccount({
      name: 'carol',
      email: 'carol@ekoz.example.com',
      password,
      displayName: 'carol',
      emailVerified: true,
    });
    const carolToken = await login('carol');

    const dm = (
      await request(server())
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: carol.id })
        .expect(201)
    ).body;
    const send = async (token: string, body: string) =>
      (
        await request(server())
          .post(`/rooms/${dm.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ body })
          .expect(201)
      ).body as { id: string };
    const bodies = async (token: string) =>
      (
        await request(server())
          .get(`/rooms/${dm.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).body.items.map((m: { body: string }) => m.body);

    const before = await send(aliceToken, 'before deletion');
    await request(server())
      .post(`/rooms/${dm.id}/leave`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    // Hidden, but the other side keeps the whole history.
    expect(await bodies(carolToken)).toEqual(['before deletion']);
    expect(await bodies(aliceToken)).toEqual([]);
    await request(server())
      .get(`/rooms/${dm.id}/messages/${before.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);

    // A new message from the other participant reopens the conversation.
    await send(carolToken, 'after deletion');
    expect(await bodies(aliceToken)).toEqual(['after deletion']);
    expect(await bodies(carolToken)).toEqual(['before deletion', 'after deletion']);
  });

  it('POST /dms reopens a hidden conversation, keeping the floor', async () => {
    const aliceToken = await login('alice');
    const dave = await accounts.createAccount({
      name: 'dave',
      email: 'dave@ekoz.example.com',
      password,
      displayName: 'dave',
      emailVerified: true,
    });
    const dm = (
      await request(server())
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: dave.id })
        .expect(201)
    ).body;
    await request(server())
      .post(`/rooms/${dm.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'old' })
      .expect(201);
    await request(server())
      .post(`/rooms/${dm.id}/leave`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    const membership = () =>
      prisma.orm.public.Membership.where({ roomId: dm.id, userId: alice.id }).first() as Promise<{
        hiddenAt: string | null;
        historyFromSeq: bigint | null;
      }>;
    const alice = (await accounts.findByIdentifier('alice'))!;
    expect((await membership()).hiddenAt).not.toBeNull();

    await request(server())
      .post('/dms')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: dave.id })
      .expect(201);

    const reopened = await membership();
    expect(reopened.hiddenAt).toBeNull();
    expect(reopened.historyFromSeq).toBe(3n);
  });

  it('creates a group dm with a light room_admin for the creator', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const bob = (await accounts.findByIdentifier('bob'))!;
    const alice = (await accounts.findByIdentifier('alice'))!;

    const group = await request(server())
      .post('/group-dms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userIds: [alice.id, bob.id], name: 'trio' })
      .expect(201);
    expect(group.body.type).toBe('group_dm');
    expect(group.body.name).toBe('trio');

    await request(server())
      .get(`/rooms/${group.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    // Group dms never surface in the public directory.
    const listed = await request(server())
      .get('/directory')
      .query({ query: 'trio' })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(listed.body.items).toEqual([]);
  });

  describe('GET /me/contacts and active-user checks', () => {
    const contacts = (token: string, query: string) =>
      request(server())
        .get('/me/contacts')
        .query({ query })
        .set('Authorization', `Bearer ${token}`);
    const mk = (name: string, displayName: string) =>
      accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName,
        emailVerified: true,
      });

    it('lists only active users sharing a room, matches name prefix or display name, escapes LIKE', async () => {
      const heidi = await mk('heidi', 'Heidi Klum');
      const ivan = await mk('ivan', 'Ann_Lee');
      const judy = await mk('judy', 'AnnXLee');
      const mallory = await mk('mallory', 'Heidi Stranger');
      const trent = await mk('trent', 'Heidi Suspended');
      const heidiToken = await login('heidi');

      // heidi shares a room with ivan, judy and trent, but not with mallory.
      await request(server())
        .post('/group-dms')
        .set('Authorization', `Bearer ${heidiToken}`)
        .send({ userIds: [ivan.id, judy.id, trent.id] })
        .expect(201);
      await prisma.orm.public.User.where({ id: trent.id }).update({ status: 'suspended' });

      const byName = await contacts(heidiToken, 'iva').expect(200);
      expect(byName.body.items.map((u: { id: string }) => u.id)).toEqual([ivan.id]);

      const byDisplayName = await contacts(heidiToken, 'lee').expect(200);
      expect(byDisplayName.body.items.map((u: { id: string }) => u.id).sort()).toEqual(
        [ivan.id, judy.id].sort(),
      );

      const escaped = await contacts(heidiToken, 'ann_').expect(200);
      expect(escaped.body.items.map((u: { id: string }) => u.id)).toEqual([ivan.id]);

      const heidiSearch = await contacts(heidiToken, 'heidi').expect(200);
      expect(heidiSearch.body.items).toEqual([]);
      expect(mallory.id).toBeDefined();
      expect(heidi.id).toBeDefined();
    });

    it('enforces the query length bounds and authentication', async () => {
      const aliceToken = await login('alice');
      await contacts(aliceToken, 'a').expect(422);
      await contacts(aliceToken, 'a'.repeat(101)).expect(422);
      await contacts(aliceToken, ' a ').expect(422);
      await request(server()).get('/me/contacts').query({ query: 'ab' }).expect(401);
    });

    it('rejects a missing or inactive user on both creation routes', async () => {
      const aliceToken = await login('alice');
      const bob = (await accounts.findByIdentifier('bob'))!;
      const unknown = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      const suspended = (await accounts.findByIdentifier('trent'))!;

      for (const userId of [unknown, suspended.id]) {
        const dm = await request(server())
          .post('/dms')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ userId })
          .expect(422);
        expect(dm.body.code).toBe('room.user_not_found');
      }

      const group = await request(server())
        .post('/group-dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userIds: [bob.id, unknown] })
        .expect(422);
      expect(group.body.code).toBe('room.user_not_found');
    });
  });

  describe('GET /me/conversations', () => {
    const mk = (name: string) =>
      accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName: name,
        emailVerified: true,
      });
    const listOf = async (token: string) =>
      (
        await request(server())
          .get('/me/conversations')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).body.items as Array<{
        id: string;
        type: string;
        isAdmin: boolean;
        lastActivityAt: string;
        participants: Array<{ user: { id: string }; isAdmin: boolean }>;
      }>;
    const say = (token: string, roomId: string, body: string) =>
      request(server())
        .post(`/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body })
        .expect(201);

    it('lists dms and groups with visibility, ordering, participants and admin flags', async () => {
      const kim = await mk('kim');
      const lou = await mk('lou');
      const max = await mk('max');
      const [kimToken, louToken] = [await login('kim'), await login('lou')];
      const post = (token: string, path: string, body: object) =>
        request(server()).post(path).set('Authorization', `Bearer ${token}`).send(body).expect(201);

      expect(await listOf(kimToken)).toEqual([]);

      const dmLou = (await post(kimToken, '/dms', { userId: lou.id })).body;
      const dmMax = (await post(kimToken, '/dms', { userId: max.id })).body;

      // Creator sees an empty dm; the recipient does not until the first message.
      expect((await listOf(kimToken)).map((c) => c.id).sort()).toEqual([dmLou.id, dmMax.id].sort());
      expect(await listOf(louToken)).toEqual([]);

      await say(kimToken, dmLou.id, 'hello lou');
      await say(kimToken, dmMax.id, 'hello max');
      const louList = await listOf(louToken);
      expect(louList.map((c) => c.id)).toEqual([dmLou.id]);
      expect(louList[0]?.participants).toEqual([
        { user: expect.objectContaining({ id: kim.id }), isAdmin: false },
      ]);
      expect(louList[0]?.isAdmin).toBe(false);

      // Newest activity first.
      expect((await listOf(kimToken)).map((c) => c.id)).toEqual([dmMax.id, dmLou.id]);
      await say(louToken, dmLou.id, 'hi kim');
      expect((await listOf(kimToken)).map((c) => c.id)).toEqual([dmLou.id, dmMax.id]);

      // Groups: creator admin, participants exclude the caller.
      const group = (await post(kimToken, '/group-dms', { userIds: [lou.id, max.id] })).body;
      const kimGroup = (await listOf(kimToken)).find((c) => c.id === group.id);
      expect(kimGroup?.type).toBe('group_dm');
      expect(kimGroup?.isAdmin).toBe(true);
      expect(kimGroup?.participants.map((p) => p.user.id).sort()).toEqual([lou.id, max.id].sort());
      expect(kimGroup?.participants.every((p) => !p.isAdmin)).toBe(true);
      // Every member sees the group from its creation, and any of them may send the first message.
      expect((await listOf(louToken)).some((c) => c.id === group.id)).toBe(true);
      expect((await listOf(await login('max'))).some((c) => c.id === group.id)).toBe(true);
      await say(louToken, group.id, 'first!');
      const louGroup = (await listOf(louToken)).find((c) => c.id === group.id);
      expect(louGroup?.isAdmin).toBe(false);
      expect(louGroup?.participants.find((p) => p.user.id === kim.id)?.isAdmin).toBe(true);

      // Spaces and channels never appear.
      const space = (
        await post(await login('owner'), '/spaces', {
          name: 'kim-space',
          visibility: 'public',
        })
      ).body;
      await post(kimToken, `/rooms/${space.id}/join`, {});
      expect((await listOf(kimToken)).every((c) => ['dm', 'group_dm'].includes(c.type))).toBe(true);

      // A deleted room disappears.
      await prisma.orm.public.Room.where({ id: group.id }).update({
        deletedAt: new Date().toISOString(),
      });
      expect((await listOf(kimToken)).some((c) => c.id === group.id)).toBe(false);
    });

    it('drops a deleted dm, lists it again after a new message, counting only messages past the floor', async () => {
      await mk('ned');
      await mk('opal');
      const nedToken = await login('ned');
      const opalToken = await login('opal');
      const opal = (await accounts.findByIdentifier('opal'))!;
      const dm = (
        await request(server())
          .post('/dms')
          .set('Authorization', `Bearer ${nedToken}`)
          .send({ userId: opal.id })
          .expect(201)
      ).body;
      await say(nedToken, dm.id, 'first');
      const before = (await listOf(opalToken))[0]!;

      await request(server())
        .post(`/rooms/${dm.id}/leave`)
        .set('Authorization', `Bearer ${opalToken}`)
        .expect(204);
      expect(await listOf(opalToken)).toEqual([]);
      expect((await listOf(nedToken)).map((c) => c.id)).toEqual([dm.id]);

      await say(nedToken, dm.id, 'second');
      const after = await listOf(opalToken);
      expect(after.map((c) => c.id)).toEqual([dm.id]);
      expect(Date.parse(after[0]!.lastActivityAt)).toBeGreaterThan(
        Date.parse(before.lastActivityAt),
      );
    });

    it('requires authentication', async () => {
      await request(server()).get('/me/conversations').expect(401);
    });
  });

  describe('group management', () => {
    const mk = async (name: string) => {
      const user = await accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName: name,
        emailVerified: true,
      });

      return { id: user.id, token: await login(name) };
    };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const createGroup = async (creator: { token: string }, userIds: string[]) =>
      (
        await request(server())
          .post('/group-dms')
          .set(auth(creator.token))
          .send({ userIds })
          .expect(201)
      ).body as { id: string };
    const overridesOf = async (roomId: string) =>
      (await prisma.orm.public.RoomMemberPermission.where({ nodeId: roomId }).all()) as Array<{
        userId: string;
        effect: string;
      }>;
    const feedTypes = async (userId: string) =>
      (
        (await prisma.orm.public.AccountFeedEvent.where({ userId }).all()) as unknown as Array<{
          payload: { type: string };
        }>
      ).map((row) => row.payload.type);

    it('renames a group as admin only, and answers 404 on a non-group room', async () => {
      const pat = await mk('pat');
      const quinn = await mk('quinn');
      const group = await createGroup(pat, [quinn.id]);

      const renamed = await request(server())
        .patch(`/group-dms/${group.id}`)
        .set(auth(pat.token))
        .send({ name: 'Weekend' })
        .expect(200);
      expect(renamed.body.name).toBe('Weekend');
      const cleared = await request(server())
        .patch(`/group-dms/${group.id}`)
        .set(auth(pat.token))
        .send({ name: null })
        .expect(200);
      expect(cleared.body.name).toBeNull();
      await request(server())
        .patch(`/group-dms/${group.id}`)
        .set(auth(pat.token))
        .send({ name: '' })
        .expect(422);

      const denied = await request(server())
        .patch(`/group-dms/${group.id}`)
        .set(auth(quinn.token))
        .send({ name: 'Mine' })
        .expect(403);
      expect(denied.body.code).toBe('room.permission_denied');

      const dm = (
        await request(server())
          .post('/dms')
          .set(auth(pat.token))
          .send({ userId: quinn.id })
          .expect(201)
      ).body;
      const notGroup = await request(server())
        .patch(`/group-dms/${dm.id}`)
        .set(auth(pat.token))
        .send({ name: 'x' })
        .expect(404);
      expect(notGroup.body.code).toBe('room.not_found');
    });

    it('adds members with or without history, ignores existing ones, validates users and size', async () => {
      const rita = await mk('rita');
      const sam = await mk('sam');
      const tess = await mk('tess');
      const uma = await mk('uma');
      const group = await createGroup(rita, [sam.id]);
      const talk = (token: string, body: string) =>
        request(server())
          .post(`/rooms/${group.id}/messages`)
          .set(auth(token))
          .send({ body })
          .expect(201);
      const bodiesFor = async (token: string) =>
        (
          await request(server()).get(`/rooms/${group.id}/messages`).set(auth(token)).expect(200)
        ).body.items.map((m: { body: string }) => m.body);
      await talk(rita.token, 'past message');

      const add = (token: string, body: object) =>
        request(server()).post(`/group-dms/${group.id}/members`).set(auth(token)).send(body);

      const full = await add(rita.token, { userIds: [tess.id, sam.id] }).expect(200);
      expect(full.body).toHaveLength(1);
      expect(full.body[0]).toMatchObject({
        roomId: group.id,
        userId: tess.id,
        role: 'member',
        invitedById: rita.id,
      });
      expect(await bodiesFor(tess.token)).toEqual(['past message']);

      await add(rita.token, { userIds: [uma.id], history: 'none' }).expect(200);
      expect(await bodiesFor(uma.token)).toEqual([]);
      await talk(rita.token, 'fresh message');
      expect(await bodiesFor(uma.token)).toEqual(['fresh message']);

      expect((await add(rita.token, { userIds: [tess.id] }).expect(200)).body).toEqual([]);
      await add(sam.token, { userIds: [tess.id] }).expect(403);
      await add(rita.token, { userIds: [] }).expect(422);
      await add(rita.token, { userIds: [tess.id], history: 'some' }).expect(422);

      const unknown = await add(rita.token, { userIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'] }).expect(
        422,
      );
      expect(unknown.body.code).toBe('room.user_not_found');

      // 4 members now; fill up to 49 with placeholder rows, then 2 more overflow the limit.
      const filler = Array.from({ length: 45 }, (_, i) => `01FILLER${String(i).padStart(18, '0')}`);
      for (const userId of filler) {
        await prisma.orm.public.Membership.create({
          roomId: group.id,
          userId,
          role: 'member',
          invitedById: null,
        });
      }
      const [vic, wes] = [await mk('vic'), await mk('wes')];
      const full2 = await add(rita.token, { userIds: [vic.id, wes.id] }).expect(422);
      expect(full2.body.code).toBe('room.group_full');
      await add(rita.token, { userIds: [vic.id] }).expect(200);
    });

    it('removes a member with their overrides, and treats self removal as leaving', async () => {
      const xena = await mk('xena');
      const yan = await mk('yan');
      const zed = await mk('zed');
      const group = await createGroup(xena, [yan.id, zed.id]);

      await request(server())
        .put(`/group-dms/${group.id}/admins/${yan.id}`)
        .set(auth(xena.token))
        .expect(204);
      await request(server())
        .delete(`/group-dms/${group.id}/members/${xena.id}`)
        .set(auth(zed.token))
        .expect(403);

      await request(server())
        .delete(`/group-dms/${group.id}/members/${yan.id}`)
        .set(auth(xena.token))
        .expect(204);
      await request(server()).get(`/rooms/${group.id}`).set(auth(yan.token)).expect(403);
      expect((await overridesOf(group.id)).some((o) => o.userId === yan.id)).toBe(false);
      const missing = await request(server())
        .delete(`/group-dms/${group.id}/members/${yan.id}`)
        .set(auth(xena.token))
        .expect(404);
      expect(missing.body.code).toBe('room.membership_not_found');

      // A plain member removing themselves is allowed (leave).
      await request(server())
        .delete(`/group-dms/${group.id}/members/${zed.id}`)
        .set(auth(zed.token))
        .expect(204);
      await request(server()).get(`/rooms/${group.id}`).set(auth(zed.token)).expect(403);
    });

    it('promotes and demotes admins', async () => {
      const abe = await mk('abe');
      const bea = await mk('bea');
      const cal = await mk('cal');
      const group = await createGroup(abe, [bea.id]);
      const rename = (token: string) =>
        request(server()).patch(`/group-dms/${group.id}`).set(auth(token)).send({ name: 'n' });

      await rename(bea.token).expect(403);
      await request(server())
        .put(`/group-dms/${group.id}/admins/${cal.id}`)
        .set(auth(abe.token))
        .expect(404);
      await request(server())
        .put(`/group-dms/${group.id}/admins/${bea.id}`)
        .set(auth(abe.token))
        .expect(204);
      await rename(bea.token).expect(200);
      await request(server())
        .put(`/group-dms/${group.id}/admins/${bea.id}`)
        .set(auth(bea.token))
        .expect(204);

      await request(server())
        .delete(`/group-dms/${group.id}/admins/${bea.id}`)
        .set(auth(abe.token))
        .expect(204);
      await rename(bea.token).expect(403);
      await rename(abe.token).expect(200);
      await request(server())
        .put(`/group-dms/${group.id}/admins/${bea.id}`)
        .set(auth(bea.token))
        .expect(403);
    });

    it('deletes the group when the last admin self-revokes, with room_deleted delivered', async () => {
      const dee = await mk('dee');
      const eli = await mk('eli');
      const group = await createGroup(dee, [eli.id]);

      await request(server())
        .delete(`/group-dms/${group.id}/admins/${dee.id}`)
        .set(auth(dee.token))
        .expect(204);

      expect(await feedTypes(eli.id)).toContain('room_deleted');
      await request(server()).get(`/rooms/${group.id}`).set(auth(eli.token)).expect(404);
      await request(server()).get(`/rooms/${group.id}/messages`).set(auth(dee.token)).expect(404);
      await request(server())
        .patch(`/group-dms/${group.id}`)
        .set(auth(dee.token))
        .send({ name: 'x' })
        .expect(404);
      expect(await overridesOf(group.id)).toEqual([]);
    });

    it('deletes the group when the last admin is removed by the server owner', async () => {
      const fay = await mk('fay');
      const gus = await mk('gus');
      const group = await createGroup(fay, [gus.id]);

      await request(server())
        .delete(`/group-dms/${group.id}/members/${fay.id}`)
        .set(auth(await login('owner')))
        .expect(204);

      expect(await feedTypes(gus.id)).toContain('room_deleted');
      await request(server()).get(`/rooms/${group.id}`).set(auth(gus.token)).expect(404);
    });
  });
});
