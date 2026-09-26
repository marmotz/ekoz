import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';
import {
  EphemeralBroadcaster,
  type PresenceSignal,
  type TypingSignal,
} from './streaming/ephemeral-broadcaster.service.js';

/**
 * Presence heartbeats and typing signals (issue #10), end to end against a
 * real database.
 */
describe('conversations — presence and typing (integration)', () => {
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

  it('heartbeat reports online, and an explicit away flag reports away', async () => {
    const ownerToken = await login('owner');

    const online = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(201);
    expect(online.body.status).toBe('online');

    const away = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ away: true })
      .expect(201);
    expect(away.body.status).toBe('away');
  });

  it('broadcasts a typing signal, needs room.post', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'typing-room');

    await request(server())
      .post(`/rooms/${channel.id}/typing`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    // A private channel Alice has no membership on: no room.post, so no typing.
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'private-typing-space', visibility: 'private' })
    ).body;
    const privateChannel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'private-typing', visibility: 'private' })
    ).body;

    const res = await request(server())
      .post(`/rooms/${privateChannel.id}/typing`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);
    expect(res.body.code).toBe('room.permission_denied');
  });

  const userIdOf = async (name: string): Promise<string> =>
    (await accounts.findByIdentifier(name))?.id as string;

  const joinSpace = async (token: string, spaceId: string) =>
    request(server())
      .post(`/rooms/${spaceId}/join`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

  it('heartbeat returns the manual away flag and the timing settings', async () => {
    const token = await login('alice');

    const res = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: 'tab-1' })
      .expect(201);

    expect(res.body).toEqual({
      status: 'online',
      manualAway: false,
      heartbeatInterval: 45,
      typingTtl: 6,
    });
  });

  it('rejects an empty or oversized clientId', async () => {
    const token = await login('alice');

    for (const clientId of ['', 'x'.repeat(65)]) {
      await request(server())
        .post('/presence/heartbeat')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId })
        .expect(422);
    }
  });

  it('persists the manual away preference across a new login', async () => {
    const first = await login('alice');
    await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${first}`)
      .send({})
      .expect(201);

    const put = await request(server())
      .put('/presence/preference')
      .set('Authorization', `Bearer ${first}`)
      .send({ manualAway: true })
      .expect(200);
    expect(put.body).toEqual({ status: 'away', manualAway: true });

    const second = await login('alice');
    const beat = await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${second}`)
      .send({})
      .expect(201);
    expect(beat.body.manualAway).toBe(true);
    expect(beat.body.status).toBe('away');

    await request(server())
      .put('/presence/preference')
      .set('Authorization', `Bearer ${second}`)
      .send({ manualAway: false })
      .expect(200);
  });

  it('delivers presence to peers sharing a room, and typing to effective members only', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const ownerId = await userIdOf('owner');
    const aliceId = await userIdOf('alice');
    const broadcaster = app.get(EphemeralBroadcaster);

    // Alice is a member of the space only: she reads the child channel by inheritance.
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'inherit-space', visibility: 'public' })
    ).body;
    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'inherit-channel', visibility: 'public' })
    ).body;
    await joinSpace(aliceToken, space.id);

    const alicePresence: PresenceSignal[] = [];
    const aliceTyping: TypingSignal[] = [];
    const ownerTyping: TypingSignal[] = [];
    const onAlicePresence = (signal: PresenceSignal) => alicePresence.push(signal);
    const onAliceTyping = (signal: TypingSignal) => aliceTyping.push(signal);
    const onOwnerTyping = (signal: TypingSignal) => ownerTyping.push(signal);
    broadcaster.onPresence(aliceId, onAlicePresence);
    broadcaster.onTyping(aliceId, onAliceTyping);
    broadcaster.onTyping(ownerId, onOwnerTyping);

    try {
      await request(server())
        .post('/presence/heartbeat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ clientId: 'owner-tab' })
        .expect(201);
      await request(server())
        .post('/presence/heartbeat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ away: true, clientId: 'owner-tab' })
        .expect(201);
      expect(alicePresence.map((signal) => signal.status)).toContain('away');
      expect(alicePresence.every((signal) => signal.userId === ownerId)).toBe(true);

      await request(server())
        .post(`/rooms/${channel.id}/typing`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      expect(aliceTyping).toEqual([{ roomId: channel.id, userId: ownerId, ttl: 6 }]);
      expect(ownerTyping).toEqual([]);
    } finally {
      broadcaster.offPresence(aliceId, onAlicePresence);
      broadcaster.offTyping(aliceId, onAliceTyping);
      broadcaster.offTyping(ownerId, onOwnerTyping);
    }
  });

  it("writes a peer's presence frame when the stream opens", async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const ownerId = await userIdOf('owner');
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'snapshot-space', visibility: 'public' })
    ).body;
    await joinSpace(aliceToken, space.id);
    await request(server())
      .post('/presence/heartbeat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ clientId: 'owner-tab' })
      .expect(201);

    const ticket = (
      await request(server())
        .post('/stream/ticket')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200)
    ).body.ticket as string;

    await new Promise<void>((resolve) => app.getHttpServer().listen(0, resolve));
    const { port } = app.getHttpServer().address() as AddressInfo;

    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/events?ticket=${ticket}`, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
          if (data.includes('event: presence')) {
            req.destroy();
            resolve(data);
          }
        });
      });
      req.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
          reject(error);
        }
      });
      setTimeout(() => reject(new Error('no presence frame received')), 10_000);
    });

    expect(body).toContain(`data: {"userId":"${ownerId}","status":"online"}`);
  });
});
