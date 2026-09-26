import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PresenceService } from './presence.service.js';

/** How often statuses are re-evaluated; bounds the lapse latency past a window. */
const SWEEP_INTERVAL_MS = 5000;

/**
 * Periodic presence sweep (issue #130): a status that lapses to `away` or
 * `offline` produces no heartbeat, so nothing would emit it. Each run publishes
 * every tracked user (the service emits only on a change) and then prunes stale
 * records. The windows are read from config on each run, so a hot reload is
 * picked up without rescheduling anything.
 */
@Injectable()
export class PresenceSweepService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PresenceSweepService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly presence: PresenceService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`Presence sweep failed: ${(error as Error).message}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Run one sweep. */
  async sweep(): Promise<void> {
    for (const userId of this.presence.trackedUserIds()) {
      try {
        await this.presence.publish(userId);
      } catch (error) {
        this.logger.error(`Presence publish failed for ${userId}: ${(error as Error).message}`);
      }
    }

    this.presence.pruneStore();
  }
}
