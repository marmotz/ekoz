import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError, RoomPermissionDeniedError } from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { type ReadMarkerRow, type ReadMarkerView, toReadMarkerView } from './receipt.view.js';

/** Read markers: "read up to seq" per (room, user) (technical.md §14, issue #9). */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
  ) {}

  /** Monotonic: a `seq` lower than the current marker is silently ignored. */
  async setReceipt(
    actor: PermissionPrincipal,
    roomId: string,
    seq: bigint,
  ): Promise<ReadMarkerView> {
    await this.assertParticipant(actor, roomId);

    const now = new Date().toISOString();
    const marker = await this.prisma.transaction(async (tx) => {
      const existing = (await tx.orm.public.ReadMarker.where({
        roomId,
        userId: actor.userId,
      }).first()) as ReadMarkerRow | null;
      if (existing && existing.seq >= seq) {
        return existing;
      }

      const row = (await tx.orm.public.ReadMarker.where({ roomId, userId: actor.userId }).upsert({
        create: { roomId, userId: actor.userId, seq, updatedAt: now },
        update: { seq, updatedAt: now },
      })) as ReadMarkerRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'receipt_updated',
        senderId: actor.userId,
        content: { userId: actor.userId, seq: seq.toString() },
      });

      return row;
    });

    return toReadMarkerView(marker);
  }

  async listReceipts(actor: PermissionPrincipal, roomId: string): Promise<ReadMarkerView[]> {
    await this.assertParticipant(actor, roomId);

    const rows = (await this.prisma.orm.public.ReadMarker.where({
      roomId,
    }).all()) as ReadMarkerRow[];

    return rows.map(toReadMarkerView);
  }

  /** Visible to participants only (technical.md §14) — not gated by a capability. */
  private async assertParticipant(actor: PermissionPrincipal, roomId: string): Promise<void> {
    if (actor.isOwner) {
      return;
    }

    const room = (await this.prisma.orm.public.Room.where({ id: roomId }).first()) as {
      deletedAt: string | null;
    } | null;
    if (!room || room.deletedAt) {
      throw new RoomNotFoundError();
    }

    const membership = (await this.prisma.orm.public.Membership.where({
      roomId,
      userId: actor.userId,
    }).first()) as unknown;
    if (!membership) {
      throw new RoomPermissionDeniedError('Only room participants can see or set read markers.');
    }
  }
}
