import { rm } from 'node:fs/promises';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlobService } from './blob.service.js';
import type { UploadRecord } from './upload.service.js';
import { UploadService } from './upload.service.js';

/** How often the sweep runs while the process is up. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Periodic upload GC (technical.md §S4): deletes expired `receiving` /
 * `failed` uploads and their staging files, and releases the blob reference
 * of expired `ready` ones (same pattern as {@link BlobGcService}).
 */
@Injectable()
export class UploadSweeperService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(UploadSweeperService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
    private readonly blobs: BlobService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error) =>
        this.logger.error(`Upload sweep failed: ${(error as Error).message}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Run one sweep. Returns the number of uploads removed. */
  async sweep(): Promise<number> {
    const cutoff = new Date().toISOString();
    const expired = (await this.prisma.orm.public.Upload.where((u) =>
      u.expiresAt.lt(cutoff),
    ).all()) as UploadRecord[];

    for (const upload of expired) {
      if (upload.state === 'ready' && upload.blobId) {
        await this.blobs.release(upload.blobId);
      }
      await rm(this.uploads.stagingPath(upload.id), { force: true });
      await this.prisma.orm.public.Upload.where({ id: upload.id }).delete();
    }

    if (expired.length > 0) {
      this.logger.log(`Upload sweep removed ${expired.length} expired upload(s)`);
    }

    return expired.length;
  }
}
