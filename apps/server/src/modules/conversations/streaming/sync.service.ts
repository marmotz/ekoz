import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError } from '../conversations.errors.js';
import { HistoryFloorService } from '../membership/history-floor.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { RoomEventView, SyncQuery, SyncResponse } from './sync.dto.js';

interface RoomEventRow {
  roomId: string;
  seq: bigint;
  type: string;
  senderId: string | null;
  content: unknown;
  originServer: string;
  createdAt: string;
}

/** Per-room catch-up: initial load and reconnection reconciliation (technical.md §16, issue #11). */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly historyFloor: HistoryFloorService,
  ) {}

  async sync(actor: PermissionPrincipal, query: SyncQuery): Promise<SyncResponse> {
    await this.permissions.assertCan(actor, query.room, 'room.read');

    const room = (await this.prisma.orm.public.Room.where({ id: query.room }).first()) as {
      lastSeq: bigint;
      deletedAt: string | null;
    } | null;
    if (!room || room.deletedAt) {
      throw new RoomNotFoundError();
    }

    const maxPage = this.config.get('sync.max_page');
    const limit = query.limit ? Math.min(query.limit, maxPage) : maxPage;
    // A catch-up never returns events older than the member's history floor.
    const floor = await this.historyFloor.floorFor(query.room, actor.userId);
    const requested = BigInt(query.since);
    const since = floor !== null && requested < floor - 1n ? floor - 1n : requested;

    const rows = (await this.prisma.orm.public.RoomEvent.where((f) =>
      and(f.roomId.eq(query.room), f.seq.gt(since)),
    )
      .orderBy((f) => f.seq.asc())
      .limit(limit)
      .all()) as RoomEventRow[];

    const events: RoomEventView[] = rows.map((row) => ({
      roomId: row.roomId,
      seq: row.seq.toString(),
      type: row.type,
      senderId: row.senderId,
      content: row.content,
      originServer: row.originServer,
      createdAt: row.createdAt,
    }));

    return { events, lastSeq: room.lastSeq.toString() };
  }
}
