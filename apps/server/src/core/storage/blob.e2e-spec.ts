import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobService } from './blob.service.js';
import { BlobGcService } from './blob-gc.service.js';
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
    prisma = {
      orm: database.db.orm,
      sql: database.db.sql,
      runtime: database.db.runtime.bind(database.db),
    } as unknown as PrismaService;
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
    const blob = await blobs.ingest(streamOf('avatar-bytes'), {
      contentType: 'image/png',
      uploaderId: null,
    });

    expect(blob.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(blob.sizeBytes).toBe(12n);
    expect(blob.contentType).toBe('image/png');
    expect(blob.storageKey).toBe(`blobs/${blob.hash.slice(0, 2)}/${blob.hash}`);

    const stored = await driver.get(blob.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stored) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('avatar-bytes');
  });

  it('deduplicates: a second ingest of identical bytes returns the same row', async () => {
    const first = await blobs.ingest(streamOf('same-content'), {
      contentType: 'image/png',
      uploaderId: null,
    });
    const second = await blobs.ingest(streamOf('same-content'), {
      contentType: 'image/jpeg',
      uploaderId: null,
    });

    expect(second.id).toBe(first.id);
    expect(await database.db.orm.public.Blob.where({ hash: first.hash }).all()).toHaveLength(1);
  });

  it('deduplicates: the original uploader is kept and touchedAt refreshes', async () => {
    const first = await blobs.ingest(streamOf('dedup-uploader'), {
      contentType: 'image/png',
      uploaderId: 'alice',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await blobs.ingest(streamOf('dedup-uploader'), {
      contentType: 'image/png',
      uploaderId: 'bob',
    });

    expect(second.uploaderId).toBe('alice');
    expect(Date.parse(second.touchedAt)).toBeGreaterThan(Date.parse(first.touchedAt));
  });

  it('retain / release move refCount and never go negative', async () => {
    const blob = await blobs.ingest(streamOf('counted'), {
      contentType: 'image/png',
      uploaderId: null,
    });

    await blobs.retain(blob.id);
    await blobs.retain(blob.id);
    await blobs.release(blob.id);
    expect((await blobs.findById(blob.id))?.refCount).toBe(1);

    await blobs.release(blob.id);
    await blobs.release(blob.id);
    expect((await blobs.findById(blob.id))?.refCount).toBe(0);
  });

  it('GC sweep drops unreferenced blobs past the grace period and keeps referenced ones', async () => {
    const orphan = await blobs.ingest(streamOf('orphan'), {
      contentType: 'image/png',
      uploaderId: null,
    });
    const kept = await blobs.ingest(streamOf('kept'), {
      contentType: 'image/png',
      uploaderId: null,
    });
    await blobs.retain(kept.id);

    const gc = new BlobGcService(
      prisma,
      { get: () => 0 } as unknown as ConfigService,
      blobs,
      driver,
    );
    const removed = await gc.sweep();

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await blobs.findById(orphan.id)).toBeNull();
    await expect(driver.get(orphan.storageKey)).rejects.toThrow();
    expect(await blobs.findById(kept.id)).not.toBeNull();
  });

  it('GC sweep skips a blob re-touched after the grace cutoff', async () => {
    const graceSeconds = 3600;
    const reTouched = await blobs.ingest(streamOf('re-touched'), {
      contentType: 'image/png',
      uploaderId: null,
    });
    // Re-ingesting the same content touches it again (dedup path), so it looks
    // fresh even though a naive read-then-delete sweep might have raced it.
    await blobs.ingest(streamOf('re-touched'), { contentType: 'image/png', uploaderId: null });

    const gc = new BlobGcService(
      prisma,
      { get: () => graceSeconds } as unknown as ConfigService,
      blobs,
      driver,
    );
    await gc.sweep();

    expect(await blobs.findById(reTouched.id)).not.toBeNull();
  });
});
