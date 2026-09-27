import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Messages snapshot a cached link preview on send/edit and release it on
 * redact (technical.md §S10, issue #144). Every case pre-seeds the
 * `LinkPreview` cache row so `resolve()` hits the cache — no real outbound
 * fetch (covered separately by `core/net/safe-fetch.spec.ts` and
 * `core/link-previews/link-preview.service.spec.ts`).
 */
describe('conversations — link previews (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let config: ConfigService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
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
    config = app.get(ConfigService);
    prisma = app.get(PrismaService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });

    await config.set('link_previews.enabled', true, null);
  }, 180_000);

  afterAll(async () => {
    await config.clear('link_previews.enabled');
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const login = async (): Promise<string> =>
    (
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'owner', password })
        .expect(200)
    ).body.accessToken as string;

  const createPublicChannel = async (token: string, name: string) => {
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `${name}-space`, visibility: 'public' })
    ).body;

    return (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: space.id, name, visibility: 'public' })
    ).body;
  };

  const seedPreview = async (url: string, fields: Partial<Record<string, unknown>> = {}) =>
    prisma.orm.public.LinkPreview.create({
      url,
      title: 'A cached page',
      description: 'Its description',
      siteName: 'Example',
      imageBlobId: null,
      status: 'ready',
      fetchedAt: new Date().toISOString(),
      ...fields,
    });

  it('snapshots the cached preview on send and removes it via edit(null)', async () => {
    const token = await login();
    const channel = await createPublicChannel(token, 'lp-send-room');
    await seedPreview('https://example.com/article');

    const sent = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        body: 'check this out: https://example.com/article',
        linkPreviewUrl: 'https://example.com/article',
      })
      .expect(201);
    expect(sent.body.linkPreview).toMatchObject({
      url: 'https://example.com/article',
      title: 'A cached page',
      description: 'Its description',
      siteName: 'Example',
      hasImage: false,
    });

    const fetched = await request(server())
      .get(`/rooms/${channel.id}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.linkPreview).toMatchObject({ url: 'https://example.com/article' });

    const removed = await request(server())
      .patch(`/rooms/${channel.id}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ linkPreviewUrl: null })
      .expect(200);
    expect(removed.body.linkPreview).toBeNull();
  });

  it('rejects a linkPreviewUrl that is not one of the http(s) links in the body', async () => {
    const token = await login();
    const channel = await createPublicChannel(token, 'lp-mismatch-room');
    await seedPreview('https://example.com/not-linked');

    const res = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'no link here', linkPreviewUrl: 'https://example.com/not-linked' })
      .expect(422);
    expect(res.body.code).toBe('link_preview.url_not_in_body');
  });

  it('replaces the preview on edit and releases the previous image blob', async () => {
    const token = await login();
    const channel = await createPublicChannel(token, 'lp-replace-room');
    const blobA = (await prisma.orm.public.Blob.create({
      hash: 'hash-a',
      sizeBytes: 10n,
      contentType: 'image/png',
      storageKey: 'key-a',
      refCount: 0,
      uploaderId: null,
      touchedAt: new Date().toISOString(),
    })) as { id: string };
    const blobB = (await prisma.orm.public.Blob.create({
      hash: 'hash-b',
      sizeBytes: 10n,
      contentType: 'image/png',
      storageKey: 'key-b',
      refCount: 0,
      uploaderId: null,
      touchedAt: new Date().toISOString(),
    })) as { id: string };
    await seedPreview('https://example.com/a', { title: 'Page A', imageBlobId: blobA.id });
    await seedPreview('https://example.com/b', { title: 'Page B', imageBlobId: blobB.id });

    const sent = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        body: 'https://example.com/a and https://example.com/b',
        linkPreviewUrl: 'https://example.com/a',
      })
      .expect(201);
    expect(sent.body.linkPreview).toMatchObject({ title: 'Page A', hasImage: true });
    expect(
      ((await prisma.orm.public.Blob.where({ id: blobA.id }).first()) as { refCount: number })
        .refCount,
    ).toBe(1);

    const edited = await request(server())
      .patch(`/rooms/${channel.id}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ linkPreviewUrl: 'https://example.com/b' })
      .expect(200);
    expect(edited.body.linkPreview).toMatchObject({ title: 'Page B', hasImage: true });
    expect(
      ((await prisma.orm.public.Blob.where({ id: blobA.id }).first()) as { refCount: number })
        .refCount,
    ).toBe(0);
    expect(
      ((await prisma.orm.public.Blob.where({ id: blobB.id }).first()) as { refCount: number })
        .refCount,
    ).toBe(1);
  });

  it('releases the image blob on redact', async () => {
    const token = await login();
    const channel = await createPublicChannel(token, 'lp-redact-room');
    const blob = (await prisma.orm.public.Blob.create({
      hash: 'hash-redact',
      sizeBytes: 10n,
      contentType: 'image/png',
      storageKey: 'key-redact',
      refCount: 0,
      uploaderId: null,
      touchedAt: new Date().toISOString(),
    })) as { id: string };
    await seedPreview('https://example.com/redact-me', { imageBlobId: blob.id });

    const sent = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        body: 'https://example.com/redact-me',
        linkPreviewUrl: 'https://example.com/redact-me',
      })
      .expect(201);
    expect(
      ((await prisma.orm.public.Blob.where({ id: blob.id }).first()) as { refCount: number })
        .refCount,
    ).toBe(1);

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect(
      await prisma.orm.public.MessageLinkPreview.where({ messageId: sent.body.id }).first(),
    ).toBeNull();
    expect(
      ((await prisma.orm.public.Blob.where({ id: blob.id }).first()) as { refCount: number })
        .refCount,
    ).toBe(0);
  });

  it('ignores linkPreviewUrl when link previews are disabled', async () => {
    const token = await login();
    const channel = await createPublicChannel(token, 'lp-disabled-room');
    await seedPreview('https://example.com/disabled-case');
    await config.clear('link_previews.enabled');
    try {
      const sent = await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          body: 'https://example.com/disabled-case',
          linkPreviewUrl: 'https://example.com/disabled-case',
        })
        .expect(201);
      expect(sent.body.linkPreview).toBeNull();
    } finally {
      await config.set('link_previews.enabled', true, null);
    }
  });
});
