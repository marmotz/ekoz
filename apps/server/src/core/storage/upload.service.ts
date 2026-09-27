import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlobService } from './blob.service.js';
import { MediaAnnotationService } from './media-annotation.service.js';
import { sniffContentType } from './sniff-content-type.js';
import {
  UploadExpiredError,
  UploadOffsetMismatchError,
  UploadTypeRejectedError,
} from './storage.errors.js';
import { StorageQuotaService } from './storage-quota.service.js';
import { isTypeAllowed } from './upload-type-filter.js';

/** An `Upload` row as this feature consumes it. */
export interface UploadRecord {
  id: string;
  userId: string;
  filename: string;
  length: bigint;
  offset: bigint;
  state: 'receiving' | 'ready' | 'failed';
  blobId: string | null;
  failure: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface FinalizationResult {
  id: string;
  state: 'ready' | 'failed';
  contentType: string | null;
  sizeBytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasThumbnail: boolean;
}

/**
 * Resumable uploads (technical.md §S4, tus 1.0 core + creation, termination,
 * expiration). Staging bytes always live on local disk
 * (`storage.upload_staging_path`), regardless of the configured
 * {@link StorageDriver} — the complete file is streamed into
 * {@link BlobService.ingest}, which moves it to the driver.
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly quotas: StorageQuotaService,
    private readonly blobs: BlobService,
    private readonly media: MediaAnnotationService,
  ) {}

  stagingPath(id: string): string {
    return join(this.config.get('storage.upload_staging_path'), id);
  }

  /** Creates the upload row and its (empty) staging file. Quota-checked. */
  async create(userId: string, length: bigint, filename: string): Promise<UploadRecord> {
    await this.quotas.assertCanStore(userId, length);

    const ttlSeconds = this.config.get('uploads.pending_ttl');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const row = (await this.prisma.orm.public.Upload.create({
      userId,
      filename,
      length,
      offset: 0n,
      state: 'receiving',
      expiresAt,
    })) as UploadRecord;

    const path = this.stagingPath(row.id);
    await mkdir(this.config.get('storage.upload_staging_path'), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(path, { flags: 'wx' });
      ws.on('error', reject);
      ws.on('close', resolve);
      ws.end();
    });

    return row;
  }

  /** The upload if it exists, belongs to `userId`, and has not expired. `null` otherwise (owner mismatch reads as not-found). */
  async findOwned(id: string, userId: string): Promise<UploadRecord | null> {
    const row = (await this.prisma.orm.public.Upload.where({ id }).first()) as UploadRecord | null;
    if (!row || row.userId !== userId) {
      return null;
    }

    return row;
  }

  assertNotExpired(upload: UploadRecord): void {
    if (new Date(upload.expiresAt).getTime() < Date.now()) {
      throw new UploadExpiredError();
    }
  }

  /**
   * Append a chunk to the staging file at `expectedOffset`, advance the
   * upload's `offset`, and finalize when the upload is complete.
   *
   * @returns the finalization result once the upload reaches `length`, `null`
   *   for a partial chunk (more bytes are expected).
   */
  async appendChunk(
    upload: UploadRecord,
    expectedOffset: bigint,
    body: NodeJS.ReadableStream,
  ): Promise<{ offset: bigint; result: FinalizationResult | null }> {
    if (upload.state !== 'receiving' || expectedOffset !== upload.offset) {
      throw new UploadOffsetMismatchError();
    }

    const remaining = upload.length - upload.offset;
    const written = await this.appendToStaging(upload.id, body, remaining);
    const offset = upload.offset + written;

    await this.prisma.orm.public.Upload.where({ id: upload.id }).update({ offset });

    if (offset < upload.length) {
      return { offset, result: null };
    }

    const result = await this.finalize({ ...upload, offset });

    return { offset, result };
  }

  private async appendToStaging(
    id: string,
    body: NodeJS.ReadableStream,
    maxBytes: bigint,
  ): Promise<bigint> {
    const path = this.stagingPath(id);

    return new Promise<bigint>((resolve, reject) => {
      let written = 0n;
      let failed = false;
      const target = createWriteStream(path, { flags: 'a' });
      target.on('error', reject);
      target.on('close', () => {
        if (!failed) resolve(written);
      });

      body.on('data', (chunk: Buffer) => {
        written += BigInt(chunk.length);
        if (written > maxBytes) {
          failed = true;
          body.pause();
          target.destroy();
          reject(new UploadOffsetMismatchError('The upload sent more bytes than declared.'));

          return;
        }
        target.write(chunk);
      });
      body.on('end', () => target.end());
      body.on('error', (error) => {
        failed = true;
        target.destroy();
        reject(error);
      });
    });
  }

  /** Sniff, filter, ingest and retain a completed upload's staged bytes. */
  private async finalize(upload: UploadRecord): Promise<FinalizationResult> {
    const path = this.stagingPath(upload.id);
    const contentType = await sniffContentType(path);
    const mode = this.config.get('uploads.filter_mode');
    const types = this.config.get('uploads.filter_types');

    if (!isTypeAllowed(contentType, mode, types)) {
      await this.prisma.orm.public.Upload.where({ id: upload.id }).update({
        state: 'failed',
        failure: 'upload.type_rejected',
      });
      await rm(path, { force: true });

      throw new UploadTypeRejectedError();
    }

    const blob = await this.blobs.ingest(createReadStream(path), {
      contentType,
      uploaderId: upload.userId,
    });
    await this.blobs.retain(blob.id);
    const metadata = await this.media.annotate(blob, path);
    await rm(path, { force: true });

    await this.prisma.orm.public.Upload.where({ id: upload.id }).update({
      state: 'ready',
      blobId: blob.id,
    });

    return {
      id: upload.id,
      state: 'ready',
      contentType: blob.contentType,
      sizeBytes: blob.sizeBytes.toString(),
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      hasThumbnail: metadata.hasThumbnail,
    };
  }

  /** Cancel an upload: releases the blob if `ready`, deletes staging bytes and the row. */
  async cancel(upload: UploadRecord): Promise<void> {
    if (upload.state === 'ready' && upload.blobId) {
      await this.blobs.release(upload.blobId);
    }

    await rm(this.stagingPath(upload.id), { force: true });
    await this.prisma.orm.public.Upload.where({ id: upload.id }).delete();
  }

  async stagingFileExists(id: string): Promise<boolean> {
    return stat(this.stagingPath(id))
      .then(() => true)
      .catch(() => false);
  }
}
