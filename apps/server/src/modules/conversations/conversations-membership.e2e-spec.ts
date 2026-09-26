import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Membership lifecycle (issue #4), end to end against a real database.
 */
describe('conversations — membership (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
  // 1x1 transparent PNG.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const server = () => app.getHttpServer();

  // Logins are rate limited: one token per account for the whole file.
  const tokens = new Map<string, string>();
  const login = async (identifier: string): Promise<string> => {
    const cached = tokens.get(identifier);
    if (cached) {
      return cached;
    }

    const res = await request(server())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);
    tokens.set(identifier, res.body.accessToken as string);

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

  const createPrivateChannel = async (ownerToken: string, name: string) => {
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `${name}-space`, visibility: 'private' })
    ).body;

    return (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name, visibility: 'private' })
    ).body;
  };

  const createInviteChannel = async (ownerToken: string, name: string) => {
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `${name}-space`, visibility: 'private' })
    ).body;

    return (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name, topic: `${name} topic`, visibility: 'invite' })
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
    prisma = app.get(PrismaService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    for (const name of ['alice', 'bob', 'carol', 'dave']) {
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

  it('joins a public channel and leaves it', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'join-leave');

    const joined = await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);
    expect(joined.body).toMatchObject({ roomId: channel.id, role: 'member' });

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(409);

    await request(server())
      .post(`/rooms/${channel.id}/leave`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    await request(server())
      .post(`/rooms/${channel.id}/leave`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
  });

  it('rejects joining a private room directly', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPrivateChannel(ownerToken, 'private-join');

    const res = await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(422);
    expect(res.body.code).toBe('room.not_joinable');
  });

  it('a ban blocks joining, and unban lifts it', async () => {
    const ownerToken = await login('owner');
    const bobToken = await login('bob');
    const bob = (await accounts.findByIdentifier('bob'))!;
    const channel = await createPublicChannel(ownerToken, 'ban-unban');

    await request(server())
      .post(`/rooms/${channel.id}/bans`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: bob.id, reason: 'testing' })
      .expect(204);

    const res = await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
    expect(res.body.code).toBe('room.banned');

    await request(server())
      .delete(`/rooms/${channel.id}/bans/${bob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(201);
  });

  it('invite, accept and decline', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const bobToken = await login('bob');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const bob = (await accounts.findByIdentifier('bob'))!;
    const channel = await createPrivateChannel(ownerToken, 'invite-flow');

    const invitation = await request(server())
      .post(`/rooms/${channel.id}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: alice.id, role: 'member' })
      .expect(201);

    await request(server())
      .post(`/invitations/${invitation.body.id}/accept`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    // Accepting again is refused: the invitation is already resolved.
    await request(server())
      .post(`/invitations/${invitation.body.id}/accept`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(409);

    const declinedInvitation = await request(server())
      .post(`/rooms/${channel.id}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: bob.id })
      .expect(201);

    await request(server())
      .post(`/invitations/${declinedInvitation.body.id}/decline`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(204);

    // A declined invitee never got membership; joining still needs an invite/request.
    const res = await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(422);
    expect(res.body.code).toBe('room.not_joinable');
  });

  it('join request approve/reject flow', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const bobToken = await login('bob');
    const channel = await createPrivateChannel(ownerToken, 'join-request');

    const approvedRequest = await request(server())
      .post(`/rooms/${channel.id}/join-request`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    await request(server())
      .post(`/rooms/${channel.id}/join-request`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(409);

    await request(server())
      .post(`/rooms/${channel.id}/join-requests/${approvedRequest.body.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const rejectedRequest = await request(server())
      .post(`/rooms/${channel.id}/join-request`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(201);

    await request(server())
      .post(`/rooms/${channel.id}/join-requests/${rejectedRequest.body.id}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .post(`/rooms/${channel.id}/join-requests/${rejectedRequest.body.id}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
  });

  it('kick removes membership; role change is capped by the caller authority', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const carolToken = await login('carol');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const carol = (await accounts.findByIdentifier('carol'))!;
    const channel = await createPublicChannel(ownerToken, 'kick-role');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);
    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(201);

    // Promote alice to room_admin so she holds room.manage_roles / room.kick.
    await request(server())
      .patch(`/rooms/${channel.id}/members/${alice.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'room_admin' })
      .expect(200);

    // A room_admin cannot promote someone above her own authority.
    const res = await request(server())
      .patch(`/rooms/${channel.id}/members/${carol.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ role: 'space_admin' })
      .expect(403);
    expect(res.body.code).toBe('room.role_above_authority');

    await request(server())
      .delete(`/rooms/${channel.id}/members/${carol.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    await request(server())
      .delete(`/rooms/${channel.id}/members/${carol.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
  });

  describe('room preview', () => {
    const preview = (roomId: string, token: string) =>
      request(server()).get(`/rooms/${roomId}/preview`).set('Authorization', `Bearer ${token}`);

    it('shows an invite room to a non-member, with the state of their join request', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const channel = await createInviteChannel(ownerToken, 'preview-invite');

      // A non-member cannot read the room itself, but can preview it.
      await request(server())
        .get(`/rooms/${channel.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(403);

      const none = await preview(channel.id, aliceToken).expect(200);
      expect(none.body).toEqual({
        id: channel.id,
        type: 'channel',
        name: 'preview-invite',
        topic: 'preview-invite topic',
        joinRequest: null,
      });

      const created = await request(server())
        .post(`/rooms/${channel.id}/join-request`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(201);
      const pending = await preview(channel.id, aliceToken).expect(200);
      expect(pending.body.joinRequest).toEqual({
        id: created.body.id,
        createdAt: created.body.createdAt,
        status: 'pending',
      });

      await request(server())
        .post(`/rooms/${channel.id}/join-requests/${created.body.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      const rejected = await preview(channel.id, aliceToken).expect(200);
      expect(rejected.body.joinRequest).toMatchObject({ id: created.body.id, status: 'rejected' });

      // Asking again resets the same request to pending.
      await request(server())
        .post(`/rooms/${channel.id}/join-request`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(201);
      const again = await preview(channel.id, aliceToken).expect(200);
      expect(again.body.joinRequest).toMatchObject({ id: created.body.id, status: 'pending' });

      await request(server())
        .post(`/rooms/${channel.id}/join-requests/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      const approved = await preview(channel.id, aliceToken).expect(200);
      expect(approved.body.joinRequest).toBeNull();
    });

    it('answers a member and a banned user too', async () => {
      const ownerToken = await login('owner');
      const bobToken = await login('bob');
      const bob = (await accounts.findByIdentifier('bob'))!;
      const channel = await createInviteChannel(ownerToken, 'preview-member-banned');

      await preview(channel.id, ownerToken).expect(200);

      await request(server())
        .post(`/rooms/${channel.id}/bans`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: bob.id })
        .expect(204);
      const banned = await preview(channel.id, bobToken).expect(200);
      expect(banned.body).toMatchObject({ id: channel.id, joinRequest: null });
    });

    it('answers 404 for a public, a private, a deleted and an unknown room', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');

      const publicChannel = await createPublicChannel(ownerToken, 'preview-public');
      const privateChannel = await createPrivateChannel(ownerToken, 'preview-private');
      const deletedChannel = await createInviteChannel(ownerToken, 'preview-deleted');
      await request(server())
        .delete(`/rooms/${deletedChannel.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      for (const id of [
        publicChannel.id,
        privateChannel.id,
        deletedChannel.id,
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ]) {
        const res = await preview(id, aliceToken).expect(404);
        expect(res.body.code).toBe('room.not_found');
      }
    });

    it('requires authentication', async () => {
      await request(server()).get('/rooms/01ARZ3NDEKTSV4RRFFQ69G5FAV/preview').expect(401);
    });
  });

  describe('my room invitations', () => {
    const list = (token: string) =>
      request(server()).get('/me/room-invitations').set('Authorization', `Bearer ${token}`);

    const invite = (ownerToken: string, roomId: string, userId: string) =>
      request(server())
        .post(`/rooms/${roomId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId })
        .expect(201);

    it('requires authentication', async () => {
      await request(server()).get('/me/room-invitations').expect(401);
    });

    it('lists only pending invitations of live rooms, newest first, with room and inviter', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const carol = (await accounts.findByIdentifier('carol'))!;
      const bob = (await accounts.findByIdentifier('bob'))!;

      const owner = (
        await request(server()).get('/me').set('Authorization', `Bearer ${ownerToken}`).expect(200)
      ).body;
      await request(server())
        .put('/me/avatar')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', pngBytes, 'a.png')
        .expect(200);
      const ownerAfterAvatar = (
        await request(server()).get('/me').set('Authorization', `Bearer ${ownerToken}`).expect(200)
      ).body;

      const first = await createPrivateChannel(ownerToken, 'my-inv-first');
      const second = await createInviteChannel(ownerToken, 'my-inv-second');
      const accepted = await createPrivateChannel(ownerToken, 'my-inv-accepted');
      const declined = await createPrivateChannel(ownerToken, 'my-inv-declined');
      const deletedRoom = await createPrivateChannel(ownerToken, 'my-inv-deleted');
      const others = await createPrivateChannel(ownerToken, 'my-inv-others');

      const firstInvitation = (await invite(ownerToken, first.id, carol.id)).body;
      const secondInvitation = (await invite(ownerToken, second.id, carol.id)).body;
      const acceptedInvitation = (await invite(ownerToken, accepted.id, carol.id)).body;
      const declinedInvitation = (await invite(ownerToken, declined.id, carol.id)).body;
      await invite(ownerToken, deletedRoom.id, carol.id);
      await invite(ownerToken, others.id, bob.id);

      await request(server())
        .post(`/invitations/${acceptedInvitation.id}/accept`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(201);
      await request(server())
        .post(`/invitations/${declinedInvitation.id}/decline`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(204);
      await request(server())
        .delete(`/rooms/${deletedRoom.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const res = await list(carolToken).expect(200);

      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
        secondInvitation.id,
        firstInvitation.id,
      ]);
      expect(res.body.items[0]).toEqual({
        id: secondInvitation.id,
        role: 'member',
        createdAt: secondInvitation.createdAt,
        room: {
          id: second.id,
          type: 'channel',
          name: 'my-inv-second',
          topic: 'my-inv-second topic',
          visibility: 'invite',
        },
        // Same builders as `GET /me`, so the two cannot drift.
        invitedBy: {
          id: owner.id,
          identifier: ownerAfterAvatar.identifier,
          displayName: 'The Owner',
          avatarUrl: ownerAfterAvatar.avatarUrl,
        },
      });
      expect(ownerAfterAvatar.avatarUrl).toContain('?v=');
    });

    it('answers an empty list when nothing is pending', async () => {
      const daveToken = await login('dave');
      const res = await list(daveToken).expect(200);
      expect(res.body).toEqual({ items: [] });
    });

    it('nulls the inviter fields once their account is deleted', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const daveToken = await login('dave');
      const carol = (await accounts.findByIdentifier('carol'))!;
      const dave = (await accounts.findByIdentifier('dave'))!;
      const channel = await createPrivateChannel(ownerToken, 'my-inv-deleted-inviter');

      const daveInvitation = (
        await request(server())
          .post(`/rooms/${channel.id}/invitations`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ userId: dave.id, role: 'room_admin' })
          .expect(201)
      ).body;
      await request(server())
        .post(`/invitations/${daveInvitation.id}/accept`)
        .set('Authorization', `Bearer ${daveToken}`)
        .expect(201);
      const carolInvitation = (
        await request(server())
          .post(`/rooms/${channel.id}/invitations`)
          .set('Authorization', `Bearer ${daveToken}`)
          .send({ userId: carol.id })
          .expect(201)
      ).body;

      await request(server())
        .delete(`/admin/users/${dave.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const res = await list(carolToken).expect(200);
      const item = res.body.items.find((i: { id: string }) => i.id === carolInvitation.id);
      expect(item.invitedBy).toEqual({
        id: dave.id,
        identifier: null,
        displayName: null,
        avatarUrl: null,
      });
    });

    it('lets a declined invitee be invited again', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const carol = (await accounts.findByIdentifier('carol'))!;
      const channel = await createPrivateChannel(ownerToken, 'my-inv-reinvite');

      const first = (await invite(ownerToken, channel.id, carol.id)).body;
      await request(server())
        .post(`/invitations/${first.id}/decline`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(204);

      const again = (await invite(ownerToken, channel.id, carol.id)).body;
      expect(again.id).toBe(first.id);

      const res = await list(carolToken).expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).toContain(first.id);
    });
  });

  describe('GET /rooms/:id/members', () => {
    const listMembers = (token: string, roomId: string, query: Record<string, string> = {}) =>
      request(server())
        .get(`/rooms/${roomId}/members`)
        .query(query)
        .set('Authorization', `Bearer ${token}`);

    const join = (token: string, roomId: string) =>
      request(server())
        .post(`/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

    type MemberItem = { role: string; joinedAt: string; user: { id: string; displayName: string } };

    it('lists explicit and inherited members once each, the nearest role winning', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const bobToken = await login('bob');
      const carolToken = await login('carol');
      const alice = (await accounts.findByIdentifier('alice'))!;
      const bob = (await accounts.findByIdentifier('bob'))!;
      const carol = (await accounts.findByIdentifier('carol'))!;
      const owner = (await accounts.findByIdentifier('owner'))!;
      const channel = await createPublicChannel(ownerToken, 'members-room');
      const spaceId = channel.parentId as string;

      // alice: space member promoted to moderator, then also an explicit channel member.
      await join(aliceToken, spaceId);
      await request(server())
        .patch(`/rooms/${spaceId}/members/${alice.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'moderator' })
        .expect(200);
      await join(aliceToken, channel.id);
      // bob: inherited only (space member, never joined the channel).
      await join(bobToken, spaceId);
      // carol: explicit channel member only.
      await join(carolToken, channel.id);

      const res = await listMembers(aliceToken, channel.id).expect(200);
      expect(res.body.nextCursor).toBeNull();
      const items = res.body.items as MemberItem[];
      const ids = items.map((i) => i.user.id);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids)).toEqual(new Set([owner.id, alice.id, bob.id, carol.id]));
      expect(ids).toHaveLength(4);

      const roleOf = (id: string) => items.find((i) => i.user.id === id)?.role;
      expect(roleOf(owner.id)).toBe('room_admin'); // explicit on the channel beats space_admin
      expect(roleOf(alice.id)).toBe('member'); // explicit channel role beats the space's moderator
      expect(roleOf(bob.id)).toBe('member'); // inherited from the space
      expect(roleOf(carol.id)).toBe('member');

      const bobItem = items.find((i) => i.user.id === bob.id)!;
      expect(bobItem.user).toEqual({
        id: bob.id,
        identifier: expect.stringMatching(/^bob\//),
        displayName: 'bob',
        avatarUrl: null,
      });
      expect(new Date(bobItem.joinedAt).toString()).not.toBe('Invalid Date');
    });

    it('paginates with an opaque cursor', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'members-page-room');
      const spaceId = channel.parentId as string;
      for (const name of ['alice', 'bob', 'carol']) {
        await join(await login(name), spaceId);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: Record<string, string> = { limit: '2' };
        if (cursor) {
          query.cursor = cursor;
        }
        const res = await listMembers(ownerToken, channel.id, query).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items.map((i: MemberItem) => i.user.id));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);

      expect(pages).toBe(2);
      expect(seen).toHaveLength(4);
      expect(new Set(seen).size).toBe(4);
      expect(seen).toEqual([...seen].sort());
    });

    it('summarises a deleted account with null profile fields', async () => {
      const ownerToken = await login('owner');
      await accounts.createAccount({
        name: 'erin',
        email: 'erin@ekoz.example.com',
        password,
        displayName: 'erin',
        emailVerified: true,
      });
      const erin = (await accounts.findByIdentifier('erin'))!;
      const channel = await createPublicChannel(ownerToken, 'members-deleted-room');
      await join(await login('erin'), channel.id);
      await prisma.orm.public.User.where({ id: erin.id }).update({ status: 'deleted' });

      const res = await listMembers(ownerToken, channel.id).expect(200);
      const item = (res.body.items as MemberItem[]).find((i) => i.user.id === erin.id);
      expect(item?.user).toEqual({
        id: erin.id,
        identifier: null,
        displayName: null,
        avatarUrl: null,
      });
    });

    it('treats a malformed cursor as a first page', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'members-bad-cursor-room');

      const first = await listMembers(ownerToken, channel.id).expect(200);
      const res = await listMembers(ownerToken, channel.id, { cursor: 'not-a-cursor' }).expect(200);
      expect(res.body).toEqual(first.body);
    });

    it('refuses a non-reader, an unknown room and invalid query values', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const channel = await createPrivateChannel(ownerToken, 'members-private-room');

      const denied = await listMembers(carolToken, channel.id).expect(403);
      expect(denied.body.code).toBe('room.permission_denied');

      const missing = await listMembers(carolToken, ulid()).expect(404);
      expect(missing.body.code).toBe('room.not_found');

      await listMembers(ownerToken, channel.id, { limit: '0' }).expect(422);
    });
  });

  describe('GET /rooms/:id/join-requests', () => {
    const requesters = ['frank', 'grace', 'heidi', 'ivan'];

    beforeAll(async () => {
      for (const name of requesters) {
        await accounts.createAccount({
          name,
          email: `${name}@ekoz.example.com`,
          password,
          displayName: name,
          emailVerified: true,
        });
      }
    });

    type PendingItem = {
      id: string;
      roomId: string;
      createdAt: string;
      user: { id: string; identifier: string | null; displayName: string | null };
    };

    const listJoinRequests = (token: string, roomId: string, query: Record<string, string> = {}) =>
      request(server())
        .get(`/rooms/${roomId}/join-requests`)
        .query(query)
        .set('Authorization', `Bearer ${token}`);

    const requestToJoin = async (name: string, roomId: string): Promise<string> =>
      (
        await request(server())
          .post(`/rooms/${roomId}/join-request`)
          .set('Authorization', `Bearer ${await login(name)}`)
          .expect(201)
      ).body.id as string;

    const userIdOf = async (name: string): Promise<string> =>
      (await accounts.findByIdentifier(name))?.id as string;

    it('lists only pending requests, oldest first, with the requester', async () => {
      const ownerToken = await login('owner');
      const channel = await createInviteChannel(ownerToken, 'join-requests-pending');

      const approved = await requestToJoin('frank', channel.id);
      const rejected = await requestToJoin('grace', channel.id);
      const first = await requestToJoin('heidi', channel.id);
      const second = await requestToJoin('ivan', channel.id);
      await request(server())
        .post(`/rooms/${channel.id}/join-requests/${approved}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(server())
        .post(`/rooms/${channel.id}/join-requests/${rejected}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const res = await listJoinRequests(ownerToken, channel.id).expect(200);
      expect(res.body.nextCursor).toBeNull();
      const items = res.body.items as PendingItem[];
      expect(items.map((i) => i.id)).toEqual([first, second]);
      expect(items[0]).toEqual({
        id: first,
        roomId: channel.id,
        createdAt: expect.any(String),
        user: {
          id: await userIdOf('heidi'),
          identifier: expect.stringMatching(/^heidi\//),
          displayName: 'heidi',
          avatarUrl: null,
        },
      });
      expect(Date.parse(items[0]?.createdAt ?? '')).toBeLessThanOrEqual(
        Date.parse(items[1]?.createdAt ?? ''),
      );
    });

    it('lists a request made again after a rejection as pending', async () => {
      const ownerToken = await login('owner');
      const channel = await createInviteChannel(ownerToken, 'join-requests-again');
      const requestId = await requestToJoin('frank', channel.id);
      await request(server())
        .post(`/rooms/${channel.id}/join-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      expect((await listJoinRequests(ownerToken, channel.id).expect(200)).body.items).toEqual([]);

      await requestToJoin('frank', channel.id);
      const items = (await listJoinRequests(ownerToken, channel.id).expect(200)).body
        .items as PendingItem[];
      expect(items.map((i) => i.id)).toEqual([requestId]);
    });

    it('paginates with an opaque cursor, keeping the order', async () => {
      const ownerToken = await login('owner');
      const channel = await createInviteChannel(ownerToken, 'join-requests-pages');
      const ids: string[] = [];
      for (const name of requesters) {
        ids.push(await requestToJoin(name, channel.id));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: Record<string, string> = { limit: '3' };
        if (cursor) {
          query.cursor = cursor;
        }
        const res = await listJoinRequests(ownerToken, channel.id, query).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(3);
        seen.push(...res.body.items.map((i: PendingItem) => i.id));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);

      expect(pages).toBe(2);
      expect(seen).toEqual(ids);

      const malformed = await listJoinRequests(ownerToken, channel.id, {
        cursor: 'not-a-cursor',
      }).expect(200);
      expect(malformed.body.items.map((i: PendingItem) => i.id)).toEqual(ids);
    });

    it('summarises a deleted requester with null profile fields', async () => {
      const ownerToken = await login('owner');
      await accounts.createAccount({
        name: 'judy',
        email: 'judy@ekoz.example.com',
        password,
        displayName: 'judy',
        emailVerified: true,
      });
      const channel = await createInviteChannel(ownerToken, 'join-requests-deleted');
      await requestToJoin('judy', channel.id);
      const judyId = await userIdOf('judy');
      await prisma.orm.public.User.where({ id: judyId }).update({ status: 'deleted' });

      const items = (await listJoinRequests(ownerToken, channel.id).expect(200)).body
        .items as PendingItem[];
      expect(items.map((i) => i.user)).toEqual([
        { id: judyId, identifier: null, displayName: null, avatarUrl: null },
      ]);
    });

    it('needs room.manage_members and refuses unknown, deleted rooms and bad queries', async () => {
      const ownerToken = await login('owner');
      const channel = await createInviteChannel(ownerToken, 'join-requests-guard');
      await requestToJoin('grace', channel.id);

      const requester = await listJoinRequests(await login('grace'), channel.id).expect(403);
      expect(requester.body.code).toBe('room.permission_denied');

      const unknown = await listJoinRequests(ownerToken, ulid()).expect(404);
      expect(unknown.body.code).toBe('room.not_found');

      await listJoinRequests(ownerToken, channel.id, { limit: '0' }).expect(422);

      const empty = await createInviteChannel(ownerToken, 'join-requests-deleted-room');
      await request(server())
        .delete(`/rooms/${empty.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      const deleted = await listJoinRequests(ownerToken, empty.id).expect(404);
      expect(deleted.body.code).toBe('room.not_found');
    });

    it('requires authentication', async () => {
      await request(server()).get(`/rooms/${ulid()}/join-requests`).expect(401);
    });
  });

  describe('leaving a group conversation', () => {
    it('clears the leaver overrides, and deletes the group when no admin remains', async () => {
      const [aliceToken, bobToken, carolToken] = [
        await login('alice'),
        await login('bob'),
        await login('carol'),
      ];
      const [alice, bob, carol] = [
        (await accounts.findByIdentifier('alice'))!,
        (await accounts.findByIdentifier('bob'))!,
        (await accounts.findByIdentifier('carol'))!,
      ];
      const group = (
        await request(server())
          .post('/group-dms')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ userIds: [bob.id, carol.id] })
          .expect(201)
      ).body;
      const adminOverrides = async () =>
        (await prisma.orm.public.RoomMemberPermission.where({ nodeId: group.id }).all()) as Array<{
          userId: string;
        }>;
      await request(server())
        .put(`/group-dms/${group.id}/admins/${bob.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(204);

      // One admin leaves: their override goes, the group survives.
      await request(server())
        .post(`/rooms/${group.id}/leave`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(204);
      expect((await adminOverrides()).map((o) => o.userId)).toEqual([bob.id]);
      await request(server())
        .get(`/rooms/${group.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      // Re-added, the former admin is a plain member again.
      await request(server())
        .post(`/group-dms/${group.id}/members`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userIds: [alice.id] })
        .expect(200);
      await request(server())
        .patch(`/group-dms/${group.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'nope' })
        .expect(403);

      // The last admin leaves: the group is deleted for everyone.
      await request(server())
        .post(`/rooms/${group.id}/leave`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(204);
      expect(await adminOverrides()).toEqual([]);
      await request(server())
        .get(`/rooms/${group.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(404);
      await request(server())
        .get(`/rooms/${group.id}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });
  });
});
