import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { ConfigService } from '../config/config.service.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import type { Blob } from './blob.service.js';
import { BlobService } from './blob.service.js';
import { FileAccessRegistry, type ResolvedFile } from './file-access.registry.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

/**
 * `POST /files/urls` and `GET /files/:token` (technical.md §S6), against a
 * real app and database. No conversations/link-preview feature exists yet in
 * this batch to register a real `FileAccessPolicy`, so the test registers its
 * own — a stand-in for what #143/#144 will contribute — to exercise the
 * mechanism (issuing, per-request re-check, Range, disposition).
 */
describe('/files (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let token: string;
  let blob: Blob;
  let allowed = true;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    await app.get(AccountService).createAccount({
      name: 'files-user',
      email: 'files-user@ekoz.example.com',
      password: 'a-perfectly-fine-passphrase',
      displayName: 'Files User',
      emailVerified: true,
    });
    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'files-user', password: 'a-perfectly-fine-passphrase' })
      .expect(200);
    token = login.body.accessToken;

    blob = await app
      .get(BlobService)
      .ingest(Readable.from([Buffer.from('the quick brown fox jumps')]), {
        contentType: 'text/plain',
        uploaderId: null,
      });
    await app.get(BlobService).retain(blob.id);

    app.get(FileAccessRegistry).register('attachment', (ref) => {
      if (ref.id !== 'att_1' || !allowed) {
        return null;
      }

      const resolved: ResolvedFile = { blob, filename: 'fox.txt' };

      return resolved;
    });
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_EMAIL__VERIFICATION_REQUIRED;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('denies an unauthenticated caller', async () => {
    await request(server())
      .post('/files/urls')
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(401);
  });

  it('issues a mix of allowed and denied refs in one batch', async () => {
    const res = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { kind: 'attachment', id: 'att_1', variant: 'original' },
          { kind: 'attachment', id: 'att_unknown', variant: 'original' },
        ],
      })
      .expect(201);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].url).toMatch(/^https?:\/\/.+\/files\//);
    expect(res.body.items[0].expiresAt).toBeDefined();
    expect(res.body.items[1].error).toBe('files.not_found');
  });

  it('downloads through the signed URL with hardening headers', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;

    const res = await request(server()).get(path).expect(200);
    expect(res.text).toBe('the quick brown fox jumps');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-disposition']).toContain('fox.txt');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers.etag).toBe(`"${blob.hash}"`);
    expect(res.headers['cache-control']).toContain('private');
  });

  it('serves a partial response for a Range request', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;

    const res = await request(server()).get(path).set('Range', 'bytes=4-8').expect(206);
    expect(res.text).toBe('quick');
    expect(res.headers['content-range']).toBe('bytes 4-8/25');
  });

  it('answers 416 for an unsatisfiable range', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;

    await request(server()).get(path).set('Range', 'bytes=1000-2000').expect(416);
  });

  it('re-checks access on every request: revoking access 404s a still-valid token', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;

    await request(server()).get(path).expect(200);

    allowed = false;
    const res = await request(server()).get(path).expect(404);
    expect(res.body.code).toBe('files.not_found');
    allowed = true;
  });

  it('rejects a tampered token', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;
    const tampered = `${path}xx`;

    await request(server()).get(tampered).expect(404);
  });

  it('rejects a request with more than 100 refs', async () => {
    const items = Array.from({ length: 101 }, () => ({
      kind: 'attachment' as const,
      id: 'att_1',
      variant: 'original' as const,
    }));

    await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items })
      .expect(422);
  });

  it('redirects to a presigned URL when the driver is s3', async () => {
    const issued = await request(server())
      .post('/files/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ kind: 'attachment', id: 'att_1', variant: 'original' }] })
      .expect(201);
    const path = new URL(issued.body.items[0].url).pathname;

    const config = app.get(ConfigService);
    const realGet = config.get.bind(config);
    const configSpy = vi
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'storage.driver' ? 's3' : realGet(key as never),
      );
    const driver = app.get<StorageDriver>(STORAGE_DRIVER);
    const presignSpy = vi
      .spyOn(driver, 'presignGet')
      .mockResolvedValue('https://s3.example.com/bucket/key?X-Amz-Signature=abc');

    const res = await request(server()).get(path).redirects(0).expect(302);
    expect(res.headers.location).toBe('https://s3.example.com/bucket/key?X-Amz-Signature=abc');
    expect(presignSpy).toHaveBeenCalledWith(
      blob.storageKey,
      60,
      expect.objectContaining({ contentType: 'text/plain' }),
    );

    configSpy.mockRestore();
    presignSpy.mockRestore();
  });
});
