import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobService } from './blob.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import {
  CapacityExceededError,
  QuotaExceededError,
  UploadTooLargeError,
} from './storage.errors.js';
import { StorageQuotaService } from './storage-quota.service.js';

function streamOf(content: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(content)]);
}

function fakeConfig(values: Record<string, unknown>): ConfigService {
  const defaults: Record<string, unknown> = {
    'storage.capacity_bytes': null,
    'uploads.max_file_bytes': 26_214_400,
  };

  return { get: (key: string) => values[key] ?? defaults[key] } as unknown as ConfigService;
}

describe('StorageQuotaService (integration)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let blobs: BlobService;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = {
      orm: database.db.orm,
      sql: database.db.sql,
      raw: database.db.raw,
      transaction: database.db.transaction.bind(database.db),
      runtime: database.db.runtime.bind(database.db),
    } as unknown as PrismaService;
    blobs = new BlobService(
      prisma,
      new LocalStorageDriver(mkdtempSync(join(tmpdir(), 'ekoz-quota-'))),
    );
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  beforeEach(async () => {
    await database.db.orm.public.Blob.all().then((rows) =>
      Promise.all(rows.map((row) => database.db.orm.public.Blob.where({ id: row.id }).delete())),
    );
    await database.db.orm.public.StorageQuotaOverride.all().then((rows) =>
      Promise.all(
        rows.map((row) =>
          database.db.orm.public.StorageQuotaOverride.where({ userId: row.userId }).delete(),
        ),
      ),
    );
  });

  it('usage sums only referenced blobs for the uploader', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({ 'uploads.default_quota_bytes': 1000 }),
    );
    const a = await blobs.ingest(streamOf('alice-1'), {
      contentType: 'text/plain',
      uploaderId: 'alice',
    });
    await blobs.retain(a.id);
    const b = await blobs.ingest(streamOf('alice-2-x'), {
      contentType: 'text/plain',
      uploaderId: 'alice',
    });
    // Unreferenced (refCount stays 0): must not count against usage.
    void b;

    expect(await quotas.usage('alice')).toBe(BigInt('alice-1'.length));
  });

  it('quota falls back to the runtime default with no override, and honours an override', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({ 'uploads.default_quota_bytes': 42 }),
    );
    expect(await quotas.quota('nobody')).toBe(42n);

    await database.db.orm.public.StorageQuotaOverride.create({
      userId: 'bob',
      quotaBytes: 7n,
      updatedAt: new Date().toISOString(),
    });
    expect(await quotas.quota('bob')).toBe(7n);
  });

  it('an override of null means unlimited', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({ 'uploads.default_quota_bytes': 1 }),
    );
    await database.db.orm.public.StorageQuotaOverride.create({
      userId: 'carol',
      quotaBytes: null,
      updatedAt: new Date().toISOString(),
    });

    expect(await quotas.quota('carol')).toBeNull();
    await expect(quotas.assertCanStore('carol', 1_000_000n)).resolves.toBeUndefined();
  });

  it('assertCanStore refuses a file over uploads.max_file_bytes', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({ 'uploads.max_file_bytes': 10, 'uploads.default_quota_bytes': 1000 }),
    );

    await expect(quotas.assertCanStore('dave', 11n)).rejects.toBeInstanceOf(UploadTooLargeError);
  });

  it('assertCanStore refuses when it would exceed the quota', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({ 'uploads.max_file_bytes': 1000, 'uploads.default_quota_bytes': 10 }),
    );
    const blob = await blobs.ingest(streamOf('01234567'), {
      contentType: 'text/plain',
      uploaderId: 'erin',
    });
    await blobs.retain(blob.id);

    await expect(quotas.assertCanStore('erin', 3n)).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(quotas.assertCanStore('erin', 2n)).resolves.toBeUndefined();
  });

  it('assertCanStore refuses when it would exceed global capacity', async () => {
    const quotas = new StorageQuotaService(
      prisma,
      fakeConfig({
        'uploads.max_file_bytes': 1000,
        'uploads.default_quota_bytes': 1000,
        'storage.capacity_bytes': 5,
      }),
    );

    await expect(quotas.assertCanStore('frank', 6n)).rejects.toBeInstanceOf(CapacityExceededError);
  });
});
