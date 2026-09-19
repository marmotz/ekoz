import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { EphemeralBroadcaster } from '../streaming/ephemeral-broadcaster.service.js';
import { PRESENCE_STORE, type PresenceStatus, type PresenceStore } from './presence.store.js';

/**
 * Presence (technical.md §15, issue #10): heartbeat-driven, ephemeral status
 * fanned out live to co-members and `dm` partners (both are just "shares a
 * room membership with" — a `dm`'s two `Membership` rows already cover the
 * partner case, no separate query needed) via {@link EphemeralBroadcaster}.
 */
@Injectable()
export class PresenceService {
  constructor(
    @Inject(PRESENCE_STORE) private readonly store: PresenceStore,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly broadcaster: EphemeralBroadcaster,
  ) {}

  async heartbeat(userId: string, explicitAway: boolean): Promise<PresenceStatus> {
    this.store.heartbeat(userId, explicitAway);
    const status = this.statusOf(userId);

    const peers = await this.visiblePeersOf(userId);
    for (const peerId of peers) {
      this.broadcaster.notifyPresence(peerId, { userId, status });
    }

    return status;
  }

  statusOf(userId: string): PresenceStatus {
    const awayAfterMs = this.config.get('presence.away_after') * 1000;
    const offlineAfterMs = this.config.get('presence.offline_after') * 1000;

    return this.store.statusOf(userId, awayAfterMs, offlineAfterMs);
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
}
