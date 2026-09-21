import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
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
});
