import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { blobStorageKey, STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

/** A stored blob as features consume it. */
export interface Blob {
  id: string;
  hash: string;
  sizeBytes: bigint;
  contentType: string;
  storageKey: string;
  refCount: number;
  uploaderId: string | null;
  touchedAt: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailBlobId: string | null;
  createdAt: string;
}

export interface IngestOptions {
  /** Sniffed MIME type (technical.md §S5), not the caller-declared one. */
  contentType: string;
  /** The uploader charged for this content on a new hash. `null` for content no quota should carry (thumbnails, link previews). */
  uploaderId: string | null;
}

/** ORM handle: the ambient client, or a transaction's `tx.orm` for {@link BlobService.retain}. */
type BlobOrm = PrismaService['orm'];

/**
 * Content-addressed blob store with deduplication (technical.md §6, ADR 0011).
 *
 * `ingest` hashes the stream to a temp file, then either returns the existing
 * blob for that hash or moves the bytes into the driver and inserts a row.
 * `retain` / `release` move `refCount`; the GC sweep ({@link BlobGcService})
 * deletes rows that stayed at zero past the grace period.
 */
@Injectable()
export class BlobService {
  private readonly logger = new Logger(BlobService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
  ) {}

  async ingest(stream: NodeJS.ReadableStream, options: IngestOptions): Promise<Blob> {
    const dir = await mkdtemp(join(tmpdir(), 'ekoz-blob-'));
    const tmp = join(dir, 'payload');
    const hasher = createHash('sha256');
    let sizeBytes = 0n;

    try {
      stream.on('data', (chunk: Buffer) => {
        sizeBytes += BigInt(chunk.length);
        hasher.update(chunk);
      });
      await pipeline(stream, createWriteStream(tmp));
      const hash = hasher.digest('hex');

      const now = new Date().toISOString();
      const existing = (await this.prisma.orm.public.Blob.where({ hash }).first()) as Blob | null;
      if (existing) {
        await this.prisma.orm.public.Blob.where({ id: existing.id }).update({ touchedAt: now });

        return { ...existing, touchedAt: now };
      }

      const storageKey = blobStorageKey(hash);
      await this.driver.put(storageKey, createReadStream(tmp), options.contentType);
      const row = (await this.prisma.orm.public.Blob.create({
        hash,
        sizeBytes,
        contentType: options.contentType,
        storageKey,
        refCount: 0,
        uploaderId: options.uploaderId,
        touchedAt: now,
      })) as Blob;
      this.logger.log(`Ingested blob ${row.id} (${sizeBytes} bytes, ${hash.slice(0, 12)}…)`);

      return row;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Fetch a blob row by id. */
  async findById(id: string): Promise<Blob | null> {
    return (await this.prisma.orm.public.Blob.where({ id }).first()) as Blob | null;
  }

  /** Open the blob's bytes for streaming to a client. */
  async openContent(blob: Blob): Promise<NodeJS.ReadableStream> {
    return this.driver.get(blob.storageKey);
  }

  /**
   * Increment `refCount`. Pass `tx.orm` to run inside the caller's transaction
   * so the reference and the referencing row commit together (technical.md §6).
   */
  async retain(blobId: string, orm: BlobOrm = this.prisma.orm): Promise<void> {
    await this.adjust(orm, blobId, +1);
  }

  /** Decrement `refCount` (never below zero). Same transaction rules as {@link retain}. */
  async release(blobId: string, orm: BlobOrm = this.prisma.orm): Promise<void> {
    await this.adjust(orm, blobId, -1);
  }

  private async adjust(orm: BlobOrm, blobId: string, delta: number): Promise<void> {
    const row = (await orm.public.Blob.where({ id: blobId }).first()) as Blob | null;
    if (!row) {
      throw new Error(`blob ${blobId} does not exist`);
    }

    const next = Math.max(0, row.refCount + delta);
    if (next === 0 && row.refCount !== 0) {
      await orm.public.Blob.where({ id: blobId }).update({
        refCount: next,
        touchedAt: new Date().toISOString(),
      });
      return;
    }

    await orm.public.Blob.where({ id: blobId }).update({ refCount: next });
  }
}
