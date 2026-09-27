import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobService } from './blob.service.js';
import { BlobAccessRegistry } from './blob-access.registry.js';

describe('GET /blobs/:id (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let blobId: string;
  let blobHash: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    const blob = await app.get(BlobService).ingest(Readable.from([Buffer.from('PNGDATA')]), {
      contentType: 'image/png',
      uploaderId: null,
    });
    blobId = blob.id;
    blobHash = blob.hash;
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('404s when no access policy grants the blob', async () => {
    await request(app.getHttpServer()).get(`/blobs/${blobId}`).expect(404);
  });

  it('404s for an unknown id', async () => {
    await request(app.getHttpServer()).get('/blobs/does-not-exist').expect(404);
  });

  it('streams the bytes with ETag and immutable caching once a policy allows it', async () => {
    app.get(BlobAccessRegistry).register((blob) => blob.id === blobId);

    const res = await request(app.getHttpServer()).get(`/blobs/${blobId}`).expect(200);
    expect(res.headers.etag).toBe(`"${blobHash}"`);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-length']).toBe('7');

    await request(app.getHttpServer())
      .get(`/blobs/${blobId}`)
      .set('If-None-Match', `"${blobHash}"`)
      .expect(304);
  });
});
