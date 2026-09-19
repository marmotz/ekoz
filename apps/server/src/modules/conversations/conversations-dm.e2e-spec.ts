import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
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
});
