import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';
import { RetentionWorkerService } from './retention/retention-worker.service.js';

/**
 * Retention rule storage, effective-rule resolution and the retention worker
 * (issue #12), end to end against a real database.
 */
describe('conversations — retention (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let config: ConfigService;
  let worker: RetentionWorkerService;

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

    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name, visibility: 'public' })
    ).body;

    return { space, channel };
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
    config = app.get(ConfigService);
    worker = app.get(RetentionWorkerService);

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
      displayName: 'alice',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('defaults a new room to inherit, resolving to the server default', async () => {
    const ownerToken = await login('owner');
    const { channel } = await createPublicChannel(ownerToken, 'retention-default');

    const res = await request(server())
      .get(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toEqual({ rule: { mode: 'inherit' }, effective: { mode: 'keep' } });
  });

  it('sets a room rule (needs room.manage_retention), emitting retention_changed', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const { channel } = await createPublicChannel(ownerToken, 'retention-set');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    // A plain member lacks room.manage_retention.
    await request(server())
      .put(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ mode: 'hide', after: '30d' })
      .expect(403);

    const set = await request(server())
      .put(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'hide', after: '30d' })
      .expect(200);
    expect(set.body).toEqual({
      rule: { mode: 'hide', after: 2_592_000 },
      effective: { mode: 'hide', after: 2_592_000 },
    });

    const sync = await request(server())
      .get(`/sync?room=${channel.id}&since=0`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const event = sync.body.events.find((e: { type: string }) => e.type === 'retention_changed');
    expect(event).toMatchObject({ content: { rule: { mode: 'hide', after: 2_592_000 } } });
  });

  it('the worker hides stale messages under a hide rule (terminal, not redacted)', async () => {
    const ownerToken = await login('owner');
    const { channel } = await createPublicChannel(ownerToken, 'retention-hide-worker');

    const message = (
      await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ body: 'soon to be hidden' })
    ).body;

    await request(server())
      .put(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'hide', after: 0 })
      .expect(200);

    await worker.sweep();

    const fetched = await request(server())
      .get(`/rooms/${channel.id}/messages/${message.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(fetched.body.hiddenAt).not.toBeNull();
    expect(fetched.body.redactedAt).toBeNull();
    expect(fetched.body.body).toBe('soon to be hidden');

    const sync = await request(server())
      .get(`/sync?room=${channel.id}&since=0`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const event = sync.body.events.find((e: { type: string }) => e.type === 'message_hidden');
    expect(event).toMatchObject({ content: { messageId: message.id } });

    // Idempotent: a second sweep does not re-hide or duplicate the event.
    await worker.sweep();
    const syncAgain = await request(server())
      .get(`/sync?room=${channel.id}&since=0`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      syncAgain.body.events.filter((e: { type: string }) => e.type === 'message_hidden'),
    ).toHaveLength(1);
  });

  it('the worker deletes stale messages under a delete rule, tombstoning the event', async () => {
    const ownerToken = await login('owner');
    const { channel } = await createPublicChannel(ownerToken, 'retention-delete-worker');

    const message = (
      await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ body: 'soon to be deleted' })
    ).body;

    await request(server())
      .put(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'delete', after: 0 })
      .expect(200);

    await worker.sweep();

    const fetched = await request(server())
      .get(`/rooms/${channel.id}/messages/${message.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(fetched.body.redactedAt).not.toBeNull();
    expect(fetched.body.body).toBe('');

    const sync = await request(server())
      .get(`/sync?room=${channel.id}&since=0`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const event = sync.body.events.find((e: { type: string }) => e.type === 'message_redacted');
    expect(event).toMatchObject({ content: { reason: 'retention' } });
    // Reused seq: the tombstone rewrites `message_created`, no new event.
    expect(
      sync.body.events.filter((e: { type: string }) => e.type === 'message_created'),
    ).toHaveLength(0);
  });

  it('an ancestor space rule applies to a channel that inherits', async () => {
    const ownerToken = await login('owner');
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'retention-ancestor-space', visibility: 'public' })
    ).body;
    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'retention-ancestor-channel', visibility: 'public' })
    ).body;

    await request(server())
      .put(`/rooms/${space.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'hide', after: '7d' })
      .expect(200);

    const res = await request(server())
      .get(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual({
      rule: { mode: 'inherit' },
      effective: { mode: 'hide', after: 604_800 },
    });
  });

  it('falls back to the server retention.default when nothing overrides it', async () => {
    await config.set('retention.default', { mode: 'delete', after: '1d' }, null);

    const ownerToken = await login('owner');
    const { channel } = await createPublicChannel(ownerToken, 'retention-server-default');

    const res = await request(server())
      .get(`/rooms/${channel.id}/retention`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual({
      rule: { mode: 'inherit' },
      effective: { mode: 'delete', after: 86_400 },
    });

    await config.clear('retention.default');
  });
});
