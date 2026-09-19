import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';

/** How often the sweep runs while the process is up (matches `BlobGcService`'s pattern). */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
/** Feed rows older than this are pruned; `/sync` remains the source of truth beyond it. */
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Periodic account-feed pruning (technical.md §16, issue #11): the feed table
 * is pruned by age; `/sync` remains authoritative for anything older.
 *
 * Simplification: the technical design also prunes rows "below every
 * session's acked `feedSeq`" — this increment has no table tracking a
 * per-session delivery cursor (only the client-held `Last-Event-ID`), so only
 * the age-based half is implemented. Age-based pruning alone is safe (it
 * never removes a row a client might still need before `/sync`'s own
 * retention), just less aggressive.
 */
@Injectable()
export class FeedPruningService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(FeedPruningService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`Account feed prune sweep failed: ${(error as Error).message}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Run one sweep. Returns the number of rows removed. */
  async sweep(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    const stale = (await this.prisma.orm.public.AccountFeedEvent.where((f) =>
      f.createdAt.lt(cutoff),
    ).all()) as Array<{ userId: string; feedSeq: bigint }>;

    for (const row of stale) {
      await this.prisma.orm.public.AccountFeedEvent.where((f) =>
        and(f.userId.eq(row.userId), f.feedSeq.eq(row.feedSeq)),
      ).delete();
    }

    if (stale.length > 0) {
      this.logger.log(`Account feed prune removed ${stale.length} row(s)`);
    }

    return stale.length;
  }
}
