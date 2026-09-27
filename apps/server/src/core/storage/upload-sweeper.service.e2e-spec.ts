import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobService } from './blob.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { MediaAnnotationService } from './media-annotation.service.js';
import type { MediaToolsService } from './media-tools.service.js';
import { StorageQuotaService } from './storage-quota.service.js';
import { UploadService } from './upload.service.js';
import { UploadSweeperService } from './upload-sweeper.service.js';

const unavailableMediaTools = {
  available: false,
  ffmpegVersion: null,
} as unknown as MediaToolsService;

function fakeConfig(values: Record<string, unknown>): ConfigService {
  const defaults: Record<string, unknown> = {
    'storage.capacity_bytes': null,
    'uploads.max_file_bytes': 26_214_400,
    'uploads.default_quota_bytes': 1_000_000,
    'uploads.pending_ttl': 3600,
    'uploads.filter_mode': 'blocklist',
    'uploads.filter_types': [],
  };

  return { get: (key: string) => values[key] ?? defaults[key] } as unknown as ConfigService;
}

describe('UploadSweeperService (integration)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let stagingRoot: string;
  let uploads: UploadService;
  let blobs: BlobService;
  let sweeper: UploadSweeperService;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = {
      orm: database.db.orm,
      sql: database.db.sql,
      raw: database.db.raw,
      transaction: database.db.transaction.bind(database.db),
      runtime: database.db.runtime.bind(database.db),
    } as unknown as PrismaService;
    stagingRoot = mkdtempSync(join(tmpdir(), 'ekoz-sweeper-staging-'));
    blobs = new BlobService(
      prisma,
      new LocalStorageDriver(mkdtempSync(join(tmpdir(), 'ekoz-sweeper-blobs-'))),
    );
    const config = fakeConfig({ 'storage.upload_staging_path': stagingRoot });
    const quotas = new StorageQuotaService(prisma, config);
    const media = new MediaAnnotationService(prisma, config, unavailableMediaTools, blobs);
    uploads = new UploadService(prisma, config, quotas, blobs, media);
    sweeper = new UploadSweeperService(prisma, uploads, blobs);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('deletes an expired receiving upload and its staging file', async () => {
    const upload = await uploads.create('gina', 5n, 'a.txt');
    await database.db.orm.public.Upload.where({ id: upload.id }).update({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const removed = await sweeper.sweep();

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await database.db.orm.public.Upload.where({ id: upload.id }).first()).toBeNull();
    expect(await uploads.stagingFileExists(upload.id)).toBe(false);
  });

  it('releases the blob of an expired ready upload', async () => {
    const upload = await uploads.create('harry', 5n, 'b.txt');
    const { result } = await uploads.appendChunk(upload, 0n, Readable.from([Buffer.from('hello')]));
    expect(result?.state).toBe('ready');

    const ready = (await database.db.orm.public.Upload.where({ id: upload.id }).first()) as {
      blobId: string;
    };
    await blobs.retain(ready.blobId); // simulate a second reference (e.g. an attachment)
    await database.db.orm.public.Upload.where({ id: upload.id }).update({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await sweeper.sweep();

    const blob = await blobs.findById(ready.blobId);
    expect(blob?.refCount).toBe(1); // the sweep released only the upload's own reference
    expect(await database.db.orm.public.Upload.where({ id: upload.id }).first()).toBeNull();
  });

  it('keeps a not-yet-expired upload and its staging bytes', async () => {
    const upload = await uploads.create('ivy', 5n, 'c.txt');

    await sweeper.sweep();

    expect(await database.db.orm.public.Upload.where({ id: upload.id }).first()).not.toBeNull();
    expect(readdirSync(stagingRoot)).toContain(upload.id);
  });
});
