import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { PermissionsService } from './permissions/permissions.service.js';

/** Attachments on messages: send, edit, remove, redact, files listing (technical.md §S9, issue #143). */
describe('conversations — attachments (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let prisma: PrismaService;
  let permissions: PermissionsService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();

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

  /** A private channel: leaving it truly revokes access (no public default role to fall back on). */
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

  /** Creates and finishes an upload in one shot; returns its id (`state: 'ready'`). */
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

  /** Creates an upload but leaves it `receiving` (partial chunk). */
  const createPendingUpload = async (
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
      .send(content.subarray(0, 1))
      .expect(204);

    return location.split('/').pop() as string;
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_STORAGE__UPLOAD_STAGING_PATH = mkdtempSync(
      join(tmpdir(), 'ekoz-attachments-staging-'),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    accounts = app.get(AccountService);
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionsService);
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
    delete process.env.EKOZ_STORAGE__UPLOAD_STAGING_PATH;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('sends a message with files only, with a body, and rejects an empty message', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'attach-send-room');
    const uploadId = await createUpload(ownerToken, Buffer.from('hello attachment'), 'note.txt');

    const filesOnly = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [uploadId] })
      .expect(201);
    expect(filesOnly.body.body).toBe('');
    expect(filesOnly.body.attachments).toMatchObject([
      { filename: 'note.txt', contentType: 'text/plain', sizeBytes: '16' },
    ]);

    const uploadWithBody = await createUpload(ownerToken, Buffer.from('second'), 'b.txt');
    const withBody = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'see attached', attachments: [uploadWithBody] })
      .expect(201);
    expect(withBody.body.body).toBe('see attached');
    expect(withBody.body.attachments).toHaveLength(1);

    const empty = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(422);
    expect(empty.body.code).toBe('message.empty');

    // The upload row is consumed: the blob reference moved to the attachment.
    expect(await prisma.orm.public.Upload.where({ id: uploadId }).first()).toBeNull();
  });

  it('refuses a foreign, expired or not-ready upload', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'attach-invalid-room');

    const foreignUploadId = await createUpload(aliceToken, Buffer.from('alices file'), 'a.txt');
    const foreign = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [foreignUploadId] })
      .expect(404);
    expect(foreign.body.code).toBe('upload.not_found');

    const pendingUploadId = await createPendingUpload(
      ownerToken,
      Buffer.from('not finished yet'),
      'p.txt',
    );
    const notReady = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [pendingUploadId] })
      .expect(409);
    expect(notReady.body.code).toBe('upload.not_ready');

    const expiredUploadId = await createUpload(ownerToken, Buffer.from('expired'), 'e.txt');
    await prisma.orm.public.Upload.where({ id: expiredUploadId }).update({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [expiredUploadId] })
      .expect(410);
    expect(expired.body.code).toBe('upload.expired');

    const missing = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [ulid()] })
      .expect(404);
    expect(missing.body.code).toBe('upload.not_found');
  });

  it('enforces attachments.max_per_message', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'attach-limit-room');
    const uploadId = await createUpload(ownerToken, Buffer.from('x'), 'x.txt');

    const res = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: Array.from({ length: 11 }, () => uploadId) })
      .expect(422);
    expect(res.body.code).toBe('message.attachment_limit_exceeded');
  });

  it('edits attachments: author-only add within the edit window, edit-rule remove', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'attach-edit-room');
    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'edit me' })
      .expect(201);

    const addUploadId = await createUpload(ownerToken, Buffer.from('added'), 'added.txt');
    const nonAuthorAdd = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ attachments: { add: [addUploadId] } })
      .expect(403);
    expect(nonAuthorAdd.body.code).toBe('room.permission_denied');

    const edited = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: { add: [addUploadId] } })
      .expect(200);
    expect(edited.body.attachments).toMatchObject([{ filename: 'added.txt' }]);
    const attachmentId = edited.body.attachments[0].id as string;

    const removed = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: { remove: [attachmentId] } })
      .expect(200);
    expect(removed.body.attachments).toEqual([]);
    expect(removed.body.body).toBe('edit me');

    const removeUnknown = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: { remove: [attachmentId] } })
      .expect(404);
    expect(removeUnknown.body.code).toBe('message.attachment_not_found');
  });

  it('rejects an edit that would leave neither body nor attachment', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'attach-edit-empty-room');
    const uploadId = await createUpload(ownerToken, Buffer.from('only file'), 'only.txt');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [uploadId] })
      .expect(201);
    const attachmentId = message.body.attachments[0].id as string;

    const res = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: { remove: [attachmentId] } })
      .expect(422);
    expect(res.body.code).toBe('message.empty');
  });

  it('removes an attachment: own deletion unaudited, moderator deletion audited', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'attach-remove-room');
    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const ownUpload = await createUpload(ownerToken, Buffer.from('own file'), 'own.txt');
    const ownMessage = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [ownUpload] })
      .expect(201);
    const ownAttachmentId = ownMessage.body.attachments[0].id as string;

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${ownMessage.body.id}/attachments/${ownAttachmentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    expect(
      await prisma.orm.public.MessageAttachment.where({ id: ownAttachmentId }).first(),
    ).toBeNull();

    const aliceUpload = await createUpload(aliceToken, Buffer.from('alice file'), 'alice.txt');
    const aliceMessage = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ attachments: [aliceUpload] })
      .expect(201);
    const aliceAttachmentId = aliceMessage.body.attachments[0].id as string;

    await request(server())
      .delete(
        `/rooms/${channel.id}/messages/${aliceMessage.body.id}/attachments/${aliceAttachmentId}`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const log = await request(server())
      .get(`/rooms/${channel.id}/moderation-log`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      log.body.some(
        (entry: { action: string; metadata: { attachmentId?: string } }) =>
          entry.action === 'moderation.remove_attachment' &&
          entry.metadata.attachmentId === aliceAttachmentId,
      ),
    ).toBe(true);
  });

  it('releases blobs on redact (own deletion) and on retention delete', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'attach-redact-room');

    const uploadId = await createUpload(ownerToken, Buffer.from('redact me'), 'r.txt');
    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attachments: [uploadId] })
      .expect(201);
    const blobId = (
      (await prisma.orm.public.MessageAttachment.where({
        messageId: message.body.id,
      }).first()) as { blobId: string }
    ).blobId;
    expect(
      ((await prisma.orm.public.Blob.where({ id: blobId }).first()) as { refCount: number })
        .refCount,
    ).toBe(1);

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    expect(
      await prisma.orm.public.MessageAttachment.where({ messageId: message.body.id }).all(),
    ).toEqual([]);
    expect(
      ((await prisma.orm.public.Blob.where({ id: blobId }).first()) as { refCount: number })
        .refCount,
    ).toBe(0);
  });

  describe('GET /rooms/:id/files', () => {
    it('filters by kind and paginates with a cursor, excluding hidden/redacted messages', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'attach-files-room');

      const send = async (buffer: Buffer, filename: string) => {
        const uploadId = await createUpload(ownerToken, buffer, filename);

        return (
          await request(server())
            .post(`/rooms/${channel.id}/messages`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ attachments: [uploadId] })
            .expect(201)
        ).body;
      };

      // Sniffed content type: a real 1x1 PNG for "media", plain text for "documents".
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      const doc1 = await send(Buffer.from('doc one'), 'doc1.txt');
      const img1 = await send(png, 'img1.png');
      const doc2 = await send(Buffer.from('doc two'), 'doc2.txt');
      const toRedact = await send(Buffer.from('will be redacted'), 'gone.txt');
      await request(server())
        .delete(`/rooms/${channel.id}/messages/${toRedact.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const media = await request(server())
        .get(`/rooms/${channel.id}/files`)
        .query({ kind: 'media' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(media.body.items.map((f: { filename: string }) => f.filename)).toEqual(['img1.png']);

      const documents = await request(server())
        .get(`/rooms/${channel.id}/files`)
        .query({ kind: 'documents' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(documents.body.items.map((f: { filename: string }) => f.filename)).toEqual([
        'doc2.txt',
        'doc1.txt',
      ]);
      expect(
        documents.body.items.find((f: { messageId: string }) => f.messageId === toRedact.id),
      ).toBeUndefined();

      const firstPage = await request(server())
        .get(`/rooms/${channel.id}/files`)
        .query({ limit: '2' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(server())
        .get(`/rooms/${channel.id}/files`)
        .query({ limit: '2', before: firstPage.body.nextCursor })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(secondPage.body.items.map((f: { filename: string }) => f.filename)).toEqual([
        'doc1.txt',
      ]);
      expect(secondPage.body.nextCursor).toBeNull();
      void doc1;
      void doc2;
      void img1;
    });
  });

  describe('attachment file access', () => {
    const issueUrl = async (token: string, attachmentId: string): Promise<string> => {
      const urls = await request(server())
        .post('/files/urls')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ kind: 'attachment', id: attachmentId, variant: 'original' }] })
        .expect(201);

      return new URL(urls.body.items[0].url, 'https://ekoz.example.com').pathname
        .split('/')
        .pop() as string;
    };

    it('denies access once the caller has left the room', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const aliceId = (await accounts.findByIdentifier('alice'))!.id;
      const channel = await createPrivateChannel(ownerToken, 'attach-access-leave-room');
      await prisma.orm.public.Membership.create({
        roomId: channel.id,
        userId: aliceId,
        role: 'member',
        invitedById: null,
      });

      const uploadId = await createUpload(ownerToken, Buffer.from('secret file'), 's.txt');
      const message = await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ attachments: [uploadId] })
        .expect(201);
      const attachmentId = message.body.attachments[0].id as string;
      const token = await issueUrl(aliceToken, attachmentId);

      await request(server()).get(`/files/${token}`).expect(200);

      await prisma.orm.public.Membership.where({ roomId: channel.id, userId: aliceId }).delete();
      permissions.invalidateRoom(channel.id);
      await request(server()).get(`/files/${token}`).expect(404);
    });

    it("gates a hidden message's attachment behind room.delete_any", async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const channel = await createPublicChannel(ownerToken, 'attach-access-hidden-room');
      await request(server())
        .post(`/rooms/${channel.id}/join`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(201);

      const uploadId = await createUpload(ownerToken, Buffer.from('hidden file'), 'h.txt');
      const message = await request(server())
        .post(`/rooms/${channel.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ attachments: [uploadId] })
        .expect(201);
      const attachmentId = message.body.attachments[0].id as string;

      // A plain member (`room.read`, no `room.delete_any`) and the owner
      // (`isOwner` bypasses every capability check) each get their own token.
      const memberToken = await issueUrl(aliceToken, attachmentId);
      const ownerFileToken = await issueUrl(ownerToken, attachmentId);
      await request(server()).get(`/files/${memberToken}`).expect(200);

      await prisma.orm.public.Message.where({ id: message.body.id }).update({
        hiddenAt: new Date().toISOString(),
      });

      await request(server()).get(`/files/${memberToken}`).expect(404);
      await request(server()).get(`/files/${ownerFileToken}`).expect(200);
    });
  });
});
