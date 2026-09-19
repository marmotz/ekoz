import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError } from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { RoomRetentionView, SetRoomRetention } from './retention.dto.js';
import {
  type EffectiveRetentionRule,
  type RetentionRule,
  retentionRuleSchema,
} from './retention-rule.js';

interface RetentionRoomLookup {
  id: string;
  retention: unknown;
  deletedAt: string | null;
}

/**
 * Retention rule storage and resolution (technical.md §13, issue #12). A
 * room's effective rule is its own if not `inherit`, else the nearest
 * ancestor space's, else `retention.default` (server config) — same
 * ancestor-walk shape as {@link PermissionsService}'s role resolution.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  async getRetention(actor: PermissionPrincipal, roomId: string): Promise<RoomRetentionView> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    const room = await this.findRoomOrThrow(roomId);

    return {
      rule: this.parseRule(room.retention),
      effective: await this.resolveEffectiveRule(roomId),
    };
  }

  async setRetention(
    actor: PermissionPrincipal,
    roomId: string,
    rule: SetRoomRetention,
  ): Promise<RoomRetentionView> {
    await this.permissions.assertCan(actor, roomId, 'room.manage_retention');
    await this.findRoomOrThrow(roomId);

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Room.where({ id: roomId }).update({
        retention: rule,
        updatedAt: new Date().toISOString(),
      });
      await this.eventLog.append(tx, {
        roomId,
        type: 'retention_changed',
        senderId: actor.userId,
        content: { rule },
      });
    });

    return {
      rule,
      effective: await this.resolveEffectiveRule(roomId),
    };
  }

  /** The rule actually applied to `roomId`: own -> nearest ancestor space -> server default. */
  async resolveEffectiveRule(roomId: string): Promise<EffectiveRetentionRule> {
    const room = await this.findRoomOrThrow(roomId);
    const ownRule = this.parseRule(room.retention);
    if (ownRule.mode !== 'inherit') {
      return ownRule;
    }

    const ancestorRows = (await this.prisma.orm.public.RoomClosure.where((f) =>
      f.descendantId.eq(roomId),
    )
      .orderBy((f) => f.depth.asc())
      .all()) as Array<{ ancestorId: string; depth: number }>;
    const ancestorIds = ancestorRows.filter((r) => r.depth > 0).map((r) => r.ancestorId);

    if (ancestorIds.length > 0) {
      const ancestorRooms = (await this.prisma.orm.public.Room.where((f) =>
        f.id.in(ancestorIds),
      ).all()) as RetentionRoomLookup[];
      const byId = new Map(ancestorRooms.map((r) => [r.id, r]));
      for (const ancestorId of ancestorIds) {
        const ancestor = byId.get(ancestorId);
        if (!ancestor) {
          continue;
        }
        const ancestorRule = this.parseRule(ancestor.retention);
        if (ancestorRule.mode !== 'inherit') {
          return ancestorRule;
        }
      }
    }

    return this.config.get('retention.default');
  }

  private parseRule(value: unknown): RetentionRule {
    return retentionRuleSchema.parse(value);
  }

  private async findRoomOrThrow(id: string): Promise<RetentionRoomLookup> {
    const row = (await this.prisma.orm.public.Room.where({
      id,
    }).first()) as RetentionRoomLookup | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }

    return row;
  }
}
