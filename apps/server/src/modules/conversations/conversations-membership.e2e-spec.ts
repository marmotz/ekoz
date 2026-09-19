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
});
