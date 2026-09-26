import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { EventLogService, type RoomTx } from '../events/event-log.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';

/** Members a group conversation holds at most, its creator included. */
export const GROUP_MAX_MEMBERS = 50;

/**
 * Group conversation invariants shared by leave, removal and admin revocation.
 * A group admin is a member with an `allow` `room.manage_members` user override;
 * a group left without any admin is deleted.
 */
@Injectable()
export class GroupLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Whether a current member of the room still holds the admin override. */
  async hasAdmin(tx: RoomTx, roomId: string): Promise<boolean> {
    const overrides = (await tx.orm.public.RoomMemberPermission.where((f) =>
      and(f.nodeId.eq(roomId), f.capability.eq('room.manage_members'), f.effect.eq('allow')),
    ).all()) as Array<{ userId: string }>;
    if (overrides.length === 0) {
      return false;
    }

    const members = (await tx.orm.public.Membership.where((f) =>
      and(f.roomId.eq(roomId), f.userId.in(overrides.map((o) => o.userId))),
    ).all()) as unknown[];

    return members.length > 0;
  }

  /** Drop every override a user holds on the room (they lose their admin status). */
  async clearOverrides(tx: RoomTx, roomId: string, userId: string): Promise<void> {
    await tx.orm.public.RoomMemberPermission.where((f) =>
      and(f.nodeId.eq(roomId), f.userId.eq(userId)),
    ).deleteAndCount();
  }

  /**
   * Delete the group when no admin is left. Returns whether it was deleted;
   * the caller then invalidates the permission cache with {@link afterDeletion}.
   */
  async deleteIfNoAdmin(tx: RoomTx, roomId: string, actorId: string | null): Promise<boolean> {
    if (await this.hasAdmin(tx, roomId)) {
      return false;
    }

    // `room_deleted` first, so fan-out still reaches every current member.
    await this.eventLog.append(tx, {
      roomId,
      type: 'room_deleted',
      senderId: actorId,
      content: {},
    });
    const now = new Date().toISOString();
    await tx.orm.public.Room.where({ id: roomId }).update({ deletedAt: now, updatedAt: now });
    await tx.orm.public.Membership.where((f) => f.roomId.eq(roomId)).deleteAndCount();
    await tx.orm.public.RoomMemberPermission.where((f) => f.nodeId.eq(roomId)).deleteAndCount();

    return true;
  }

  afterDeletion(roomId: string): void {
    this.permissions.invalidateRoom(roomId);
  }

  /** The room, when it is a live `group_dm`. */
  async findGroup(roomId: string): Promise<{ id: string; lastSeq: bigint } | null> {
    const row = (await this.prisma.orm.public.Room.where({ id: roomId }).first()) as {
      id: string;
      type: string;
      lastSeq: bigint;
      deletedAt: string | null;
    } | null;

    return row && row.type === 'group_dm' && !row.deletedAt ? row : null;
  }
}
