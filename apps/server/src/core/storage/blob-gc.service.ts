import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlobService } from './blob.service.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver.js';

/** How often the sweep runs while the process is up. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

interface DeletedBlob {
  storage_key: string;
  thumbnail_blob_id: string | null;
}

/**
 * Periodic blob GC (technical.md §S2): deletes driver objects and rows for blobs
 * that have sat at `refCount = 0` **untouched** longer than
 * `storage.gc_grace_seconds` (default 1 h). The sweep is a single
 * `DELETE ... WHERE ref_count = 0 AND touched_at < cutoff RETURNING ...`: the
 * `refCount` check happens inside the same statement that deletes the row, so
 * a caller that re-touches (retains) a blob between ingest and this sweep
 * cannot have it deleted out from under it — there is no read-then-delete window.
 */
@Injectable()
export class BlobGcService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BlobGcService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly blobs: BlobService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error) =>
        this.logger.error(`Blob GC sweep failed: ${(error as Error).message}`),
      );
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

    const plan = this.prisma.sql.public.blob
      .delete()
      .where((f, fns) => fns.and(fns.eq(f.ref_count, 0), fns.lt(f.touched_at, cutoff)))
      .returning('storage_key', 'thumbnail_blob_id')
      .build();
    const deleted = (await this.prisma.runtime().query(plan)) as DeletedBlob[];

    for (const blob of deleted) {
      await this.driver.delete(blob.storage_key);
      if (blob.thumbnail_blob_id) {
        await this.blobs.release(blob.thumbnail_blob_id);
      }
    }

    if (deleted.length > 0) {
      this.logger.log(`Blob GC removed ${deleted.length} unreferenced blob(s)`);
    }

    return deleted.length;
  }
}
