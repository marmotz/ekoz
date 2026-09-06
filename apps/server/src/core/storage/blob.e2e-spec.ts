import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobGcService } from './blob-gc.service.js';
import { BlobService } from './blob.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';

function streamOf(content: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(content)]);
}

describe('BlobService (integration)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let driver: LocalStorageDriver;
  let blobs: BlobService;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = { orm: database.db.orm } as unknown as PrismaService;
    driver = new LocalStorageDriver(mkdtempSync(join(tmpdir(), 'ekoz-blob-e2e-')));
    blobs = new BlobService(prisma, driver);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('applies the migration: the blob table is queryable', async () => {
    expect(await database.db.orm.public.Blob.all()).toEqual([]);
  });

  it('ingests a stream, hashing and storing it', async () => {
    const blob = await blobs.ingest(streamOf('avatar-bytes'), { declaredType: 'image/png' });

    expect(blob.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(blob.sizeBytes).toBe(12);
    expect(blob.contentType).toBe('image/png');
    expect(blob.storageKey).toBe(`blobs/${blob.hash.slice(0, 2)}/${blob.hash}`);

    const stored = await driver.get(blob.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stored) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('avatar-bytes');
  });

  it('deduplicates: a second ingest of identical bytes returns the same row', async () => {
    const first = await blobs.ingest(streamOf('same-content'), { declaredType: 'image/png' });
    const second = await blobs.ingest(streamOf('same-content'), { declaredType: 'image/jpeg' });

    expect(second.id).toBe(first.id);
    expect(await database.db.orm.public.Blob.where({ hash: first.hash }).all()).toHaveLength(1);
  });

  it('retain / release move refCount and never go negative', async () => {
    const blob = await blobs.ingest(streamOf('counted'), { declaredType: 'image/png' });

    await blobs.retain(blob.id);
    await blobs.retain(blob.id);
    await blobs.release(blob.id);
    expect((await blobs.findById(blob.id))?.refCount).toBe(1);

    await blobs.release(blob.id);
    await blobs.release(blob.id);
    expect((await blobs.findById(blob.id))?.refCount).toBe(0);
  });

  it('GC sweep drops unreferenced blobs past the grace period and keeps referenced ones', async () => {
    const orphan = await blobs.ingest(streamOf('orphan'), { declaredType: 'image/png' });
    const kept = await blobs.ingest(streamOf('kept'), { declaredType: 'image/png' });
    await blobs.retain(kept.id);

    const gc = new BlobGcService(prisma, { get: () => 0 } as unknown as ConfigService, driver);
    const removed = await gc.sweep();

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await blobs.findById(orphan.id)).toBeNull();
    await expect(driver.get(orphan.storageKey)).rejects.toThrow();
    expect(await blobs.findById(kept.id)).not.toBeNull();
  });
});
