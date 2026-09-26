import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { EphemeralBroadcaster } from '../streaming/ephemeral-broadcaster.service.js';
import type { HeartbeatResponse, PresencePreferenceResponse } from './presence.dto.js';
import {
  DEFAULT_CLIENT_ID,
  PRESENCE_STORE,
  type PresenceStatus,
  type PresenceStore,
} from './presence.store.js';

/**
 * Presence (technical.md §15, issue #10): heartbeat-driven, ephemeral status
 * fanned out live to co-members and `dm` partners (both are just "shares a
 * room membership with" — a `dm`'s two `Membership` rows already cover the
 * partner case, no separate query needed) via {@link EphemeralBroadcaster}.
 *
 * A frame is pushed only when a user's derived status changes ({@link publish}),
 * whether the cause is a heartbeat, a manual-away toggle or a lapse noticed by
 * `PresenceSweepService`.
 */
@Injectable()
export class PresenceService {
  constructor(
    @Inject(PRESENCE_STORE) private readonly store: PresenceStore,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly broadcaster: EphemeralBroadcaster,
  ) {}

  async heartbeat(
    userId: string,
    idle: boolean,
    clientId: string = DEFAULT_CLIENT_ID,
  ): Promise<HeartbeatResponse> {
    const manualAway = await this.loadManualAway(userId);
    this.store.heartbeat(userId, clientId, idle);
    await this.publish(userId);

    return {
      status: this.statusOf(userId),
      manualAway,
      heartbeatInterval: this.config.get('presence.heartbeat_interval'),
      typingTtl: this.config.get('typing.ttl'),
    };
  }

  /** Persist the manual-away preference and publish the resulting status. */
  async setManualAway(userId: string, manualAway: boolean): Promise<PresencePreferenceResponse> {
    await this.prisma.orm.public.PresencePreference.where({ userId }).upsert({
      create: { userId, manualAway, updatedAt: new Date().toISOString() },
      update: { manualAway, updatedAt: new Date().toISOString() },
    });
    this.store.setManualAway(userId, manualAway);
    await this.publish(userId);

    return { status: this.statusOf(userId), manualAway };
  }

  /**
   * Recompute `userId`'s status and, only when it differs from the last one
   * pushed, notify every visible peer.
   */
  async publish(userId: string): Promise<void> {
    const status = this.statusOf(userId);
    if (status === (this.store.lastEmitted(userId) ?? 'offline')) {
      return;
    }
    this.store.markEmitted(userId, status);

    const peers = await this.visiblePeersOf(userId);
    for (const peerId of peers) {
      this.broadcaster.notifyPresence(peerId, { userId, status });
    }
  }

  statusOf(userId: string): PresenceStatus {
    const awayAfterMs = this.config.get('presence.away_after') * 1000;
    const offlineAfterMs = this.config.get('presence.offline_after') * 1000;

    return this.store.statusOf(userId, awayAfterMs, offlineAfterMs);
  }

  /** Users the sweep must re-evaluate, and prune once their windows are over. */
  trackedUserIds(): string[] {
    return this.store.userIds();
  }

  pruneStore(): void {
    this.store.prune(this.config.get('presence.offline_after') * 1000);
  }

  /**
   * One frame per visible peer of `userId` that is not `offline` — written when
   * a stream opens; a client treats an unknown user as `offline`.
   */
  async snapshotFor(userId: string): Promise<Array<{ userId: string; status: PresenceStatus }>> {
    const peers = await this.visiblePeersOf(userId);

    return peers
      .map((peerId) => ({ userId: peerId, status: this.statusOf(peerId) }))
      .filter((signal) => signal.status !== 'offline');
  }

  /** Every user who shares at least one room with `userId` (technical.md §15). */
  async visiblePeersOf(userId: string): Promise<string[]> {
    const ownRooms = (await this.prisma.orm.public.Membership.where({ userId }).all()) as Array<{
      roomId: string;
    }>;
    if (ownRooms.length === 0) {
      return [];
    }

    const roomIds = ownRooms.map((m) => m.roomId);
    const coMembers = (await this.prisma.orm.public.Membership.where((f) =>
      f.roomId.in(roomIds),
    ).all()) as Array<{ userId: string }>;

    return [...new Set(coMembers.map((m) => m.userId).filter((id) => id !== userId))];
  }

  /** The cached preference, read from the database on the user's first heartbeat. */
  private async loadManualAway(userId: string): Promise<boolean> {
    const cached = this.store.manualAwayOf(userId);
    if (cached !== undefined) {
      return cached;
    }

    const row = (await this.prisma.orm.public.PresencePreference.where({
      userId,
    }).first()) as { manualAway: boolean } | null;
    const manualAway = row?.manualAway ?? false;
    this.store.setManualAway(userId, manualAway);

    return manualAway;
  }
}
