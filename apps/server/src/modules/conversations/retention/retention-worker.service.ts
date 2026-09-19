import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import type { MessageRow } from '../messages/message.view.js';
import { MessagesService } from '../messages/messages.service.js';
import { RetentionService } from './retention.service.js';

/** Rooms scanned, and messages processed per room, in a single sweep — keeps each run bounded. */
const ROOM_BATCH_SIZE = 200;
const MESSAGE_BATCH_SIZE = 100;

interface RetentionRoomRow {
  id: string;
}

/**
 * Periodic retention worker (technical.md §13, issue #12): hides or deletes
 * messages once they cross their room's effective retention rule's `after`.
 * Interval is configurable (`retention.worker_interval`, default 15 min,
 * matches `BlobGcService` / `FeedPruningService`'s `setInterval` pattern).
 * Batched (bounded rooms and messages per run) and idempotent — a message
 * already `hiddenAt` / `redactedAt` is excluded by the query itself, so a
 * concurrent or repeated sweep never reprocesses it.
 */
@Injectable()
export class RetentionWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly retention: RetentionService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get('retention.worker_interval') * 1000;
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`Retention sweep failed: ${(error as Error).message}`),
      );
    }, intervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Run one sweep. Returns the number of messages hidden or deleted. */
  async sweep(): Promise<number> {
    const rooms = (await this.prisma.orm.public.Room.where((f) => f.deletedAt.isNull())
      .limit(ROOM_BATCH_SIZE)
      .all()) as RetentionRoomRow[];

    let processed = 0;
    for (const room of rooms) {
      processed += await this.sweepRoom(room.id);
    }

    if (processed > 0) {
      this.logger.log(`Retention sweep processed ${processed} message(s)`);
    }

    return processed;
  }

  private async sweepRoom(roomId: string): Promise<number> {
    const rule = await this.retention.resolveEffectiveRule(roomId);
    if (rule.mode === 'keep') {
      return 0;
    }

    const cutoff = new Date(Date.now() - rule.after * 1000).toISOString();

    if (rule.mode === 'hide') {
      const stale = (await this.prisma.orm.public.Message.where((f) =>
        and(
          f.roomId.eq(roomId),
          f.createdAt.lt(cutoff),
          f.hiddenAt.isNull(),
          f.redactedAt.isNull(),
        ),
      )
        .limit(MESSAGE_BATCH_SIZE)
        .all()) as MessageRow[];

      for (const message of stale) {
        await this.hideMessage(roomId, message);
      }

      return stale.length;
    }

    // `mode === 'delete'`. Not gated on `hiddenAt`: a message already hidden
    // still has its body in the DB (hide is not a step towards delete).
    const stale = (await this.prisma.orm.public.Message.where((f) =>
      and(f.roomId.eq(roomId), f.createdAt.lt(cutoff), f.redactedAt.isNull()),
    )
      .limit(MESSAGE_BATCH_SIZE)
      .all()) as MessageRow[];

    for (const message of stale) {
      // Attachment dereferencing: no message-attachment linkage exists yet
      // (content-and-sharing is deferred) — nothing to dereference today.
      await this.messages.redactMessage(roomId, message, null, 'retention');
    }

    return stale.length;
  }

  private async hideMessage(roomId: string, message: MessageRow): Promise<void> {
    const now = new Date().toISOString();
    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Message.where({ id: message.id }).update({ hiddenAt: now });
      await this.eventLog.append(tx, {
        roomId,
        type: 'message_hidden',
        senderId: null,
        content: { messageId: message.id },
      });
    });
  }
}
