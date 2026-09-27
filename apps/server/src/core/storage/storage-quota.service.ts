import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CapacityExceededError,
  QuotaExceededError,
  UploadTooLargeError,
} from './storage.errors.js';

type Tx = Parameters<Parameters<PrismaService['transaction']>[0]>[0];

export interface StorageUsage {
  usedBytes: bigint;
  pendingBytes: bigint;
  quotaBytes: bigint | null;
}

/**
 * Per-user quota and global capacity accounting (technical.md §S8). Usage is
 * computed on the fly with a query over the indexed `uploader_id`, never with a
 * counter table that could drift from `Blob.refCount`.
 */
@Injectable()
export class StorageQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Sum of `sizeBytes` for `userId`'s referenced blobs (ingested, ready content only). */
  async blobUsage(userId: string, orm: PrismaService['orm'] = this.prisma.orm): Promise<bigint> {
    const result = await orm.public.Blob.where((b) => b.uploaderId.eq(userId))
      .where((b) => b.refCount.gt(0))
      .aggregate((a) => ({ total: a.sumBigInt('sizeBytes') }));

    return result.total ?? 0n;
  }

  /**
   * Declared length of `userId`'s `receiving` uploads — reserved but not yet
   * ingested. A `ready` upload is already counted through its blob's
   * reference; an expired pending upload stops counting once its reservation
   * is released (technical.md §S8).
   */
  async pendingUsage(userId: string, orm: PrismaService['orm'] = this.prisma.orm): Promise<bigint> {
    const result = await orm.public.Upload.where((u) => u.userId.eq(userId))
      .where((u) => u.state.eq('receiving'))
      .aggregate((a) => ({ total: a.sumBigInt('length') }));

    return result.total ?? 0n;
  }

  /** {@link blobUsage} + {@link pendingUsage}: the figure checked against the quota. */
  async usage(userId: string, orm: PrismaService['orm'] = this.prisma.orm): Promise<bigint> {
    const [blobs, pending] = await Promise.all([
      this.blobUsage(userId, orm),
      this.pendingUsage(userId, orm),
    ]);

    return blobs + pending;
  }

  /** The effective quota for `userId`: their override, or the runtime default. `null` = unlimited. */
  async quota(userId: string, orm: PrismaService['orm'] = this.prisma.orm): Promise<bigint | null> {
    const override = (await orm.public.StorageQuotaOverride.where({ userId }).first()) as {
      quotaBytes: bigint | null;
    } | null;

    if (override) {
      return override.quotaBytes;
    }

    return BigInt(this.config.get('uploads.default_quota_bytes'));
  }

  /** `blobUsage`, `pendingUsage` and `quota` for `userId` in one call (`GET /me/storage`). */
  async storageOf(userId: string): Promise<StorageUsage> {
    const [usedBytes, pendingBytes, quotaBytes] = await Promise.all([
      this.blobUsage(userId),
      this.pendingUsage(userId),
      this.quota(userId),
    ]);

    return { usedBytes, pendingBytes, quotaBytes };
  }

  /**
   * Sum of `sizeBytes` across every blob (occupied bytes, referenced or not),
   * plus every `receiving` upload's declared length.
   */
  async globalUsage(orm: PrismaService['orm'] = this.prisma.orm): Promise<bigint> {
    const [blobs, pending] = await Promise.all([
      orm.public.Blob.aggregate((a) => ({ total: a.sumBigInt('sizeBytes') })),
      orm.public.Upload.where((u) => u.state.eq('receiving')).aggregate((a) => ({
        total: a.sumBigInt('length'),
      })),
    ]);

    return (blobs.total ?? 0n) + (pending.total ?? 0n);
  }

  /**
   * Throws when storing `bytes` more for `userId` would violate the max file
   * size, their quota, or the server's global capacity. A `pg_advisory_xact_lock`
   * held on `userId` for the check's transaction serialises two concurrent
   * checks for the same user, so they cannot both pass (technical.md §S8).
   */
  async assertCanStore(userId: string, bytes: bigint): Promise<void> {
    const maxFileBytes = BigInt(this.config.get('uploads.max_file_bytes'));
    if (bytes > maxFileBytes) {
      throw new UploadTooLargeError(
        `The upload exceeds the maximum allowed file size of ${maxFileBytes} bytes.`,
      );
    }

    await this.prisma.transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const usedBytes = await this.usage(userId, tx.orm);
      const quotaBytes = await this.quota(userId, tx.orm);
      if (quotaBytes !== null && usedBytes + bytes > quotaBytes) {
        throw new QuotaExceededError(usedBytes, quotaBytes);
      }

      const capacityBytes = this.config.get('storage.capacity_bytes');
      if (capacityBytes !== null) {
        const globalUsed = await this.globalUsage(tx.orm);
        if (globalUsed + bytes > BigInt(capacityBytes)) {
          throw new CapacityExceededError();
        }
      }
    });
  }

  private async lockUser(tx: Tx, userId: string): Promise<void> {
    const plan = this.prisma.raw
      .sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`.affectedCount();
    await tx.execute(plan.build());
  }
}
