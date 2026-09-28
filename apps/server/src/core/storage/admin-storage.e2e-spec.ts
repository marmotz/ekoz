import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

/** `/admin/users/:id/storage(-quota)`, `/admin/storage`, `/admin/attachments`, `/admin/blobs/:id` (technical.md §S11, issue #146). */
describe('admin storage (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let prisma: PrismaService;
  let ownerToken: string;
  let memberToken: string;
  let memberId: string;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();
  // A real 1x1 PNG so `sniffContentType` reports `image/png`.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    prisma = app.get(PrismaService);
    const accounts = app.get(AccountService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    const member = await accounts.createAccount({
      name: 'member',
      email: 'member@ekoz.example.com',
      password,
      displayName: 'Member',
      emailVerified: true,
    });
    memberId = member.id;

    ownerToken = (
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'owner', password })
        .expect(200)
    ).body.accessToken;
    memberToken = (
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'member', password })
        .expect(200)
    ).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const createUpload = async (
    token: string,
    content: Buffer,
    filename: string,
  ): Promise<string> => {
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', String(content.length))
      .set('Upload-Metadata', `filename ${Buffer.from(filename).toString('base64')}`)
      .expect(201);
    const location = created.headers.location as string;
    await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', '0')
      .set('Content-Type', 'application/offset+octet-stream')
      .send(content)
      .expect(200);

    return location.split('/').pop() as string;
  };

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

  it('refuses a non-owner on every admin storage endpoint', async () => {
    await request(server())
      .get(`/admin/users/${memberId}/storage`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(server())
      .get('/admin/storage')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(server())
      .get('/admin/attachments')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('runs the per-user quota override lifecycle', async () => {
    const initial = await request(server())
      .get(`/admin/users/${memberId}/storage`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(initial.body.overridden).toBe(false);

    await request(server())
      .put(`/admin/users/${memberId}/storage-quota`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quotaBytes: '1000' })
      .expect(204);

    const overridden = await request(server())
      .get(`/admin/users/${memberId}/storage`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(overridden.body).toMatchObject({ overridden: true, quotaBytes: '1000' });

    await request(server())
      .put(`/admin/users/${memberId}/storage-quota`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quotaBytes: null })
      .expect(204);
    const unlimited = await request(server())
      .get(`/admin/users/${memberId}/storage`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(unlimited.body).toMatchObject({ overridden: true, quotaBytes: null });

    await request(server())
      .delete(`/admin/users/${memberId}/storage-quota`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const reset = await request(server())
      .get(`/admin/users/${memberId}/storage`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(reset.body.overridden).toBe(false);
  });

  it('404s a quota override for an unknown user', async () => {
    await request(server())
      .get('/admin/users/01ARZ3NDEKTSV4RRFFQ69G5FAV/storage')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('reports dashboard figures including a top consumer', async () => {
    const channel = await createPublicChannel(ownerToken, 'admin-dash-room');
    const uploadId = await createUpload(ownerToken, Buffer.from('dashboard figures'), 'd.txt');
    await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [uploadId] })
      .expect(201);

    const res = await request(server())
      .get('/admin/storage')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.blobCount).toBeGreaterThan(0);
    expect(res.body.driver).toBe('local');
    expect(res.body.mediaTools).toMatchObject({ available: expect.any(Boolean) });
    expect(res.body.topConsumers.length).toBeGreaterThan(0);
    expect(res.body.topConsumers[0].user.id).toBeDefined();
  });

  it('searches attachments with filters, newest first, paginated', async () => {
    const channel = await createPublicChannel(ownerToken, 'admin-search-room');
    const upload1 = await createUpload(ownerToken, Buffer.from('doc one contents'), 'alpha.txt');
    const message1 = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [upload1] })
      .expect(201);
    const upload2 = await createUpload(ownerToken, Buffer.from('doc two contents'), 'beta.txt');
    await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [upload2] })
      .expect(201);

    const byName = await request(server())
      .get('/admin/attachments')
      .query({ q: 'alpha' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(byName.body.items.map((i: { filename: string }) => i.filename)).toEqual(['alpha.txt']);
    expect(byName.body.items[0].room).toMatchObject({ id: channel.id });
    expect(byName.body.items[0].message).toMatchObject({ id: message1.body.id });
    expect(byName.body.items[0].uploader.id).toBeDefined();
    expect(byName.body.items[0].blobId).toBeDefined();
    expect(byName.body.items[0].refCount).toBe(1);

    const byRoom = await request(server())
      .get('/admin/attachments')
      .query({ roomId: channel.id, limit: 1 })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(byRoom.body.items).toHaveLength(1);
    expect(byRoom.body.items[0].filename).toBe('beta.txt');
    expect(byRoom.body.nextCursor).not.toBeNull();

    const nextPage = await request(server())
      .get('/admin/attachments')
      .query({ roomId: channel.id, limit: 1, before: byRoom.body.nextCursor })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(nextPage.body.items[0].filename).toBe('alpha.txt');
    expect(nextPage.body.nextCursor).toBeNull();
  });

  it('removes a blob everywhere: two rooms and an avatar, releasing every reference', async () => {
    const roomA = await createPublicChannel(ownerToken, 'admin-remove-a-room');
    const roomB = await createPublicChannel(ownerToken, 'admin-remove-b-room');
    await request(server())
      .post(`/rooms/${roomB.id}/join`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);

    // Same bytes everywhere: content-addressed dedup means all three end up on one blob.
    const uploadA = await createUpload(ownerToken, pngBytes, 'shared.png');
    const messageA = await request(server())
      .post(`/rooms/${roomA.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [uploadA] })
      .expect(201);
    const uploadB = await createUpload(memberToken, pngBytes, 'shared.png');
    const messageB = await request(server())
      .post(`/rooms/${roomB.id}/messages`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ attachments: [uploadB] })
      .expect(201);
    await request(server())
      .put('/me/avatar')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', pngBytes, 'shared.png')
      .expect(200);

    const attachmentRow = (await prisma.orm.public.MessageAttachment.where({
      messageId: messageA.body.id,
    }).first()) as { blobId: string };
    const targetBlobId = attachmentRow.blobId;

    const blobBefore = (await prisma.orm.public.Blob.where({ id: targetBlobId }).first()) as {
      refCount: number;
      hash: string;
    };
    expect(blobBefore.refCount).toBe(3);

    const ownerId = (
      (await prisma.orm.public.User.where({ name: 'owner' }).first()) as unknown as { id: string }
    ).id;
    const ownerBefore = (await prisma.orm.public.UserProfile.where({
      userId: ownerId,
    }).first()) as { avatarBlobId: string | null };
    expect(ownerBefore.avatarBlobId).toBe(targetBlobId);

    await request(server())
      .delete(`/admin/blobs/${targetBlobId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    expect(
      await prisma.orm.public.MessageAttachment.where({ messageId: messageA.body.id }).all(),
    ).toEqual([]);
    expect(
      await prisma.orm.public.MessageAttachment.where({ messageId: messageB.body.id }).all(),
    ).toEqual([]);
    const blobAfter = (await prisma.orm.public.Blob.where({ id: targetBlobId }).first()) as {
      refCount: number;
    };
    expect(blobAfter.refCount).toBe(0);

    const ownerAfter = (await prisma.orm.public.UserProfile.where({
      userId: ownerId,
    }).first()) as { avatarBlobId: string | null };
    expect(ownerAfter.avatarBlobId).toBeNull();

    const eventsA = (await prisma.orm.public.RoomEvent.where({
      roomId: roomA.id,
      type: 'attachment_removed',
    }).all()) as unknown[];
    const eventsB = (await prisma.orm.public.RoomEvent.where({
      roomId: roomB.id,
      type: 'attachment_removed',
    }).all()) as unknown[];
    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsB.length).toBeGreaterThan(0);

    const audit = (await prisma.orm.public.AuditLog.where({
      action: 'storage.content_removed',
      targetId: targetBlobId,
    }).all()) as unknown as Array<{ metadata: { hash: string } }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata.hash).toBe(blobBefore.hash);
  });

  it('404s removing an unknown blob', async () => {
    await request(server())
      .delete('/admin/blobs/01ARZ3NDEKTSV4RRFFQ69G5FAV')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
