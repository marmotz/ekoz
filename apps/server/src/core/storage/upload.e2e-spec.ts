import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

describe('/uploads (integration, tus)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let token: string;

  const server = () => app.getHttpServer();
  const metadata = (filename: string) => `filename ${Buffer.from(filename).toString('base64')}`;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED = 'false';
    process.env.EKOZ_STORAGE__UPLOAD_STAGING_PATH = mkdtempSync(
      join(tmpdir(), 'ekoz-upload-staging-'),
    );
    process.env.EKOZ_UPLOADS__FILTER_MODE = 'blocklist';
    process.env.EKOZ_UPLOADS__FILTER_TYPES = 'application/zip';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    await app.get(AccountService).createAccount({
      name: 'uploader',
      email: 'uploader@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Uploader',
      emailVerified: true,
    });

    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'uploader', password: 'a-perfectly-fine-passphrase' })
      .expect(200);
    token = login.body.accessToken;
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED;
    delete process.env.EKOZ_STORAGE__UPLOAD_STAGING_PATH;
    delete process.env.EKOZ_UPLOADS__FILTER_MODE;
    delete process.env.EKOZ_UPLOADS__FILTER_TYPES;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('OPTIONS advertises the tus capabilities without authentication', async () => {
    const res = await request(server()).options('/uploads').expect(204);
    expect(res.headers['tus-version']).toBe('1.0.0');
    expect(res.headers['tus-extension']).toBe('creation,termination,expiration');
    expect(res.headers['tus-max-size']).toBeDefined();
  });

  it('completes a full upload across several PATCH chunks', async () => {
    const content = Buffer.from('hello, resumable world!');

    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', String(content.length))
      .set('Upload-Metadata', metadata('hello.txt'))
      .expect(201);
    const location = created.headers.location as string;
    expect(location).toMatch(/^\/uploads\//);
    const id = location.split('/').pop() as string;
    expect(created.headers['upload-expires']).toBeDefined();

    const first = content.subarray(0, 10);
    const patch1 = await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', '0')
      .set('Content-Type', 'application/offset+octet-stream')
      .send(first)
      .expect(204);
    expect(patch1.headers['upload-offset']).toBe(String(first.length));

    const second = content.subarray(10);
    const patch2 = await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', String(first.length))
      .set('Content-Type', 'application/offset+octet-stream')
      .send(second)
      .expect(200);
    expect(patch2.headers['upload-offset']).toBe(String(content.length));
    const ekozUpload = JSON.parse(patch2.headers['ekoz-upload'] as string);
    expect(ekozUpload.state).toBe('ready');
    expect(ekozUpload.contentType).toBe('text/plain');
    expect(patch2.body.state).toBe('ready');

    const view = await request(server())
      .get(location)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(view.body).toMatchObject({ id, state: 'ready', offset: String(content.length) });
  });

  it('resumes after a HEAD check', async () => {
    const content = Buffer.from('resume-me');
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', String(content.length))
      .set('Upload-Metadata', metadata('r.txt'))
      .expect(201);
    const location = created.headers.location as string;

    await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', '0')
      .set('Content-Type', 'application/offset+octet-stream')
      .send(content.subarray(0, 4))
      .expect(204);

    const head = await request(server())
      .head(location)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(head.headers['upload-offset']).toBe('4');
    expect(head.headers['upload-length']).toBe(String(content.length));

    await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', head.headers['upload-offset'] as string)
      .set('Content-Type', 'application/offset+octet-stream')
      .send(content.subarray(4))
      .expect(200);
  });

  it('rejects a PATCH whose Upload-Offset does not match', async () => {
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', '5')
      .set('Upload-Metadata', metadata('m.txt'))
      .expect(201);
    const location = created.headers.location as string;

    const res = await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', '3')
      .set('Content-Type', 'application/offset+octet-stream')
      .send(Buffer.from('xx'))
      .expect(409);
    expect(res.body.code).toBe('upload.offset_mismatch');
  });

  it('refuses a file over uploads.max_file_bytes at creation', async () => {
    const res = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', '999999999999')
      .set('Upload-Metadata', metadata('huge.bin'))
      .expect(413);
    expect(res.body.code).toBe('upload.too_large');
  });

  it('rejects content whose sniffed type is filtered, marking the upload failed', async () => {
    // A ZIP magic-byte header, blocked in the default blocklist config.
    const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', String(content.length))
      .set('Upload-Metadata', metadata('a.zip'))
      .expect(201);
    const location = created.headers.location as string;

    const res = await request(server())
      .patch(location)
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Offset', '0')
      .set('Content-Type', 'application/offset+octet-stream')
      .send(content)
      .expect(422);
    expect(res.body.code).toBe('upload.type_rejected');

    const view = await request(server())
      .get(location)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(view.body.state).toBe('failed');
  });

  it('cancels an upload, deleting it', async () => {
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', '3')
      .set('Upload-Metadata', metadata('c.txt'))
      .expect(201);
    const location = created.headers.location as string;

    await request(server()).delete(location).set('Authorization', `Bearer ${token}`).expect(204);

    await request(server()).get(location).set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('is owner-only: another user cannot see or act on it, unauthenticated is refused', async () => {
    const created = await request(server())
      .post('/uploads')
      .set('Authorization', `Bearer ${token}`)
      .set('Upload-Length', '3')
      .set('Upload-Metadata', metadata('secret.txt'))
      .expect(201);
    const location = created.headers.location as string;

    await request(server()).get(location).expect(401);

    await app.get(AccountService).createAccount({
      name: 'other-uploader',
      email: 'other-uploader@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Other',
      emailVerified: true,
    });
    const otherLogin = await request(server())
      .post('/auth/login')
      .send({ identifier: 'other-uploader', password: 'a-perfectly-fine-passphrase' })
      .expect(200);

    await request(server())
      .get(location)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`)
      .expect(404);
  });
});
