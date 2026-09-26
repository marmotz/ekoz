import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  GroupFullError,
  MembershipNotFoundError,
  RoomNotFoundError,
  UserNotFoundError,
} from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { MembershipService } from '../membership/membership.service.js';
import {
  type MembershipRow,
  type MembershipView,
  toMembershipView,
} from '../membership/membership.view.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { type RoomRow, type RoomView, toRoomView } from '../rooms/room.view.js';
import type { AddGroupDmMembers, RenameGroupDm } from './group-dm.dto.js';
import { GROUP_MAX_MEMBERS, GroupLifecycleService } from './group-lifecycle.service.js';

/**
 * Group conversation management (`/group-dms/:id/*`). Every action requires
 * `room.manage_members` (the group admin override) and answers `404
 * room.not_found` for a room that is not a live `group_dm`, so the room type
 * never leaks. Leaving a group stays with `POST /rooms/:id/leave`.
 */
@Injectable()
export class GroupDmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly membership: MembershipService,
    private readonly groups: GroupsService,
    private readonly lifecycle: GroupLifecycleService,
  ) {}

  async rename(
    actor: PermissionPrincipal,
    roomId: string,
    input: RenameGroupDm,
  ): Promise<RoomView> {
    await this.requireAdminOnGroup(actor, roomId);

    const now = new Date().toISOString();
    const row = await this.prisma.transaction(async (tx) => {
      const updated = (await tx.orm.public.Room.where({ id: roomId }).update({
        name: input.name,
        updatedAt: now,
      })) as RoomRow;
      await this.eventLog.append(tx, {
        roomId,
        type: 'room_updated',
        senderId: actor.userId,
        content: { name: input.name },
      });

      return updated;
    });

    return toRoomView(row);
  }

  async addMembers(
    actor: PermissionPrincipal,
    roomId: string,
    input: AddGroupDmMembers,
  ): Promise<MembershipView[]> {
    const group = await this.requireAdminOnGroup(actor, roomId);
    const wanted = [...new Set(input.userIds)];

    const existing = (await this.prisma.orm.public.Membership.where((f) =>
      f.roomId.eq(roomId),
    ).all()) as MembershipRow[];
    const alreadyMembers = new Set(existing.map((m) => m.userId));
    const toAdd = wanted.filter((id) => !alreadyMembers.has(id));
    if (toAdd.length === 0) {
      return [];
    }

    const active = (await this.prisma.orm.public.User.where((f) =>
      and(f.id.in(toAdd), f.status.eq('active')),
    ).all()) as unknown[];
    if (active.length !== toAdd.length) {
      throw new UserNotFoundError();
    }
    if (existing.length + toAdd.length > GROUP_MAX_MEMBERS) {
      throw new GroupFullError();
    }

    const rows = await this.prisma.transaction(async (tx) => {
      // Read in the transaction: the floor is the first seq the newcomer may read.
      const current = (await tx.orm.public.Room.where({ id: roomId }).first()) as {
        lastSeq: bigint;
      };
      const floor = input.history === 'none' ? current.lastSeq + 1n : null;
      const created: MembershipRow[] = [];
      for (const userId of toAdd) {
        created.push(
          (await tx.orm.public.Membership.create({
            roomId,
            userId,
            role: 'member',
            invitedById: actor.userId,
            historyFromSeq: floor,
          })) as MembershipRow,
        );
        await this.eventLog.append(tx, {
          roomId,
          type: 'member_joined',
          senderId: actor.userId,
          content: { userId, role: 'member' },
        });
      }

      return created;
    });

    this.permissions.invalidateRoom(group.id);

    return rows.map(toMembershipView);
  }

  async removeMember(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    // Removing oneself is leaving, open to every member.
    if (userId === actor.userId) {
      await this.requireGroup(roomId);
      await this.membership.leave(actor, roomId);
      return;
    }

    await this.requireAdminOnGroup(actor, roomId);
    await this.requireMember(roomId, userId);

    const deleted = await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Membership.where({ roomId, userId }).delete();
      await this.lifecycle.clearOverrides(tx, roomId, userId);
      await this.groups.removeUserFromNodeGroups(tx, roomId, userId);
      await this.eventLog.append(tx, {
        roomId,
        type: 'member_kicked',
        senderId: actor.userId,
        content: { userId },
      });

      return this.lifecycle.deleteIfNoAdmin(tx, roomId, actor.userId);
    });

    this.permissions.invalidateRoom(roomId);
    if (deleted) {
      this.lifecycle.afterDeletion(roomId);
    }
  }

  async grantAdmin(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.requireAdminOnGroup(actor, roomId);
    await this.requireMember(roomId, userId);

    await this.prisma.transaction((tx) =>
      this.permissions.writeMemberOverride(
        tx,
        actor.userId,
        roomId,
        userId,
        'room.manage_members',
        'allow',
      ),
    );

    this.permissions.invalidateRoom(roomId);
  }

  async revokeAdmin(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.requireAdminOnGroup(actor, roomId);
    await this.requireMember(roomId, userId);

    const deleted = await this.prisma.transaction(async (tx) => {
      await this.permissions.writeMemberOverride(
        tx,
        actor.userId,
        roomId,
        userId,
        'room.manage_members',
        'deny',
      );

      return this.lifecycle.deleteIfNoAdmin(tx, roomId, actor.userId);
    });

    this.permissions.invalidateRoom(roomId);
    if (deleted) {
      this.lifecycle.afterDeletion(roomId);
    }
  }

  private async requireGroup(roomId: string): Promise<{ id: string; lastSeq: bigint }> {
    const group = await this.lifecycle.findGroup(roomId);
    if (!group) {
      throw new RoomNotFoundError();
    }

    return group;
  }

  private async requireAdminOnGroup(
    actor: PermissionPrincipal,
    roomId: string,
  ): Promise<{ id: string; lastSeq: bigint }> {
    const group = await this.requireGroup(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.manage_members');

    return group;
  }

  private async requireMember(roomId: string, userId: string): Promise<void> {
    const row = (await this.prisma.orm.public.Membership.where({
      roomId,
      userId,
    }).first()) as unknown;
    if (!row) {
      throw new MembershipNotFoundError();
    }
  }
}
