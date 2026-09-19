import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Public directory (issue #6), end to end against a real database.
 */
describe('conversations — directory (integration)', () => {
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

  it('lists and searches public channels, excludes private ones', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Directory space', visibility: 'public' })
    ).body;
    const publicChannel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'astronomy-lovers', visibility: 'public' })
    ).body;
    await request(server())
      .post('/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: space.id, name: 'secret-room', visibility: 'private' })
      .expect(201);

    const list = await request(server())
      .get('/directory')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).toContain(publicChannel.id);
    expect(list.body.items.every((r: { visibility: string }) => r.visibility === 'public')).toBe(
      true,
    );

    const searched = await request(server())
      .get('/directory')
      .query({ query: 'astronomy' })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(searched.body.items.map((r: { id: string }) => r.id)).toContain(publicChannel.id);

    const noMatch = await request(server())
      .get('/directory')
      .query({ query: 'zzz-nonexistent' })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(noMatch.body.items).toEqual([]);
  });

  it('publish and unpublish flip visibility and need directory.publish', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');

    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Publish space', visibility: 'public' })
    ).body;
    const channel = (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name: 'unlisted', visibility: 'private' })
    ).body;

    await request(server())
      .post(`/rooms/${channel.id}/publish`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);

    const published = await request(server())
      .post(`/rooms/${channel.id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(published.body.visibility).toBe('public');

    const list = await request(server())
      .get('/directory')
      .query({ query: 'unlisted' })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).toContain(channel.id);

    const unpublished = await request(server())
      .post(`/rooms/${channel.id}/unpublish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(unpublished.body.visibility).toBe('private');
  });
});
