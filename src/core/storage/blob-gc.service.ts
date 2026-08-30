import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Blob } from './blob.service.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

/** How often the sweep runs while the process is up. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Periodic blob GC (technical.md §6): deletes driver objects and rows for blobs
 * that have sat at `refCount = 0` longer than `storage.gc_grace_seconds`
 * (default 1 h). The grace window avoids racing an in-flight reference that has
 * ingested a blob but not yet committed its `retain`.
 */
@Injectable()
export class BlobGcService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BlobGcService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error) => this.logger.error(`Blob GC sweep failed: ${(error as Error).message}`));
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Run one sweep. Returns the number of blobs removed. */
  async sweep(): Promise<number> {
    const graceMs = this.config.get('storage.gc_grace_seconds') * 1000;
    const cutoff = new Date(Date.now() - graceMs).toISOString();
    const stale = (await this.prisma.orm.public.Blob.where((b) => b.refCount.eq(0))
      .where((b) => b.createdAt.lt(cutoff))
      .all()) as Blob[];

    for (const blob of stale) {
      await this.driver.delete(blob.storageKey);
      await this.prisma.orm.public.Blob.where({ id: blob.id }).delete();
    }

    if (stale.length > 0) {
      this.logger.log(`Blob GC removed ${stale.length} unreferenced blob(s)`);
    }

    return stale.length;
  }
}
