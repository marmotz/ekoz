import { Injectable } from '@nestjs/common';
import { and, not } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import {
  GroupMemberNotMemberError,
  GroupNameTakenError,
  GroupNotFoundError,
  RoomNotFoundError,
} from '../conversations.errors.js';
import { EventLogService, type RoomTx } from '../events/event-log.service.js';
import { EffectiveMembersQuery } from '../membership/effective-members.query.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import {
  type GroupDetail,
  type GroupListView,
  type GroupRow,
  type GroupSummary,
} from './group.view.js';
import { assertGroupNameNotReserved, isNameTaken } from './group-name.js';
import type { CreateGroup, RenameGroup } from './groups.dto.js';

interface GroupMemberRow {
  groupId: string;
  userId: string;
}

/**
 * Room groups: named member sets defined on a room or space and mentioned as
 * `@<name>` (web-client-mentions technical.md S4). A group is visible from its
 * own node and every descendant; its name is unique over the whole
 * ancestor/descendant chain so a token never resolves to two groups.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly effectiveMembers: EffectiveMembersQuery,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  /** Groups defined on `roomId` and on its ancestors. */
  async list(actor: PermissionPrincipal, roomId: string): Promise<GroupListView> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    await this.findRoomOrThrow(roomId);

    const nodeIds = await this.ancestorsAndSelf(roomId);
    const groups = (await this.prisma.orm.public.RoomGroup.where((f) =>
      f.nodeId.in(nodeIds),
    ).all()) as GroupRow[];
    const members = await this.membersOf(groups.map((g) => g.id));

    return {
      items: groups
        .map((group) => this.toSummary(group, roomId, members, actor.userId))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
    };
  }

  async get(actor: PermissionPrincipal, roomId: string, groupId: string): Promise<GroupDetail> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    await this.findRoomOrThrow(roomId);
    const group = await this.findVisibleGroupOrThrow(roomId, groupId);

    return this.toDetail(group, roomId, actor.userId);
  }

  async create(
    actor: PermissionPrincipal,
    roomId: string,
    input: CreateGroup,
  ): Promise<GroupDetail> {
    await this.permissions.assertCan(actor, roomId, 'room.manage_groups');
    await this.findRoomOrThrow(roomId);

    assertGroupNameNotReserved(input.name);
    await this.assertNameFree(roomId, input.name, null);

    const memberIds = [...new Set(input.memberIds ?? [])];
    await this.assertEffectiveMembers(roomId, memberIds);

    const group = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.RoomGroup.create({
        nodeId: roomId,
        name: input.name,
        createdById: actor.userId,
      })) as GroupRow;
      for (const userId of memberIds) {
        await tx.orm.public.RoomGroupMember.create({ groupId: row.id, userId });
      }
      await this.eventLog.append(tx, {
        roomId,
        type: 'group_changed',
        senderId: actor.userId,
        content: { groupId: row.id, change: 'created', name: row.name },
      });

      return row;
    });

    return this.toDetail(group, roomId, actor.userId);
  }

  async rename(
    actor: PermissionPrincipal,
    roomId: string,
    groupId: string,
    input: RenameGroup,
  ): Promise<GroupDetail> {
    const group = await this.findManageableGroupOrThrow(actor, roomId, groupId);

    assertGroupNameNotReserved(input.name);
    await this.assertNameFree(group.nodeId, input.name, group.id);

    const renamed = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.RoomGroup.where({ id: group.id }).update({
        name: input.name,
      })) as GroupRow;
      await this.eventLog.append(tx, {
        roomId: group.nodeId,
        type: 'group_changed',
        senderId: actor.userId,
        content: { groupId: group.id, change: 'renamed', name: row.name },
      });

      return row;
    });

    return this.toDetail(renamed, roomId, actor.userId);
  }

  async remove(actor: PermissionPrincipal, roomId: string, groupId: string): Promise<void> {
    const group = await this.findManageableGroupOrThrow(actor, roomId, groupId);

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomGroupMember.where((f) => f.groupId.eq(group.id)).deleteAndCount();
      await tx.orm.public.RoomGroup.where({ id: group.id }).delete();
      await this.eventLog.append(tx, {
        roomId: group.nodeId,
        type: 'group_changed',
        senderId: actor.userId,
        content: { groupId: group.id, change: 'deleted', name: group.name },
      });
    });
  }

  /** Idempotent: adding a member already in the group changes nothing and emits nothing. */
  async addMember(
    actor: PermissionPrincipal,
    roomId: string,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.findManageableGroupOrThrow(actor, roomId, groupId);
    await this.assertEffectiveMembers(group.nodeId, [userId]);

    const existing = (await this.prisma.orm.public.RoomGroupMember.where({
      groupId: group.id,
      userId,
    }).first()) as unknown;
    if (existing) {
      return;
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomGroupMember.create({ groupId: group.id, userId });
      await this.eventLog.append(tx, {
        roomId: group.nodeId,
        type: 'group_changed',
        senderId: actor.userId,
        content: { groupId: group.id, change: 'member_added', name: group.name, userId },
      });
    });
  }

  /** Idempotent: removing a user who is not in the group changes nothing and emits nothing. */
  async removeMember(
    actor: PermissionPrincipal,
    roomId: string,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.findManageableGroupOrThrow(actor, roomId, groupId);

    const existing = (await this.prisma.orm.public.RoomGroupMember.where({
      groupId: group.id,
      userId,
    }).first()) as unknown;
    if (!existing) {
      return;
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomGroupMember.where({ groupId: group.id, userId }).delete();
      await this.eventLog.append(tx, {
        roomId: group.nodeId,
        type: 'group_changed',
        senderId: actor.userId,
        content: { groupId: group.id, change: 'member_removed', name: group.name, userId },
      });
    });
  }

  /**
   * Drop `userId` from every group defined on `nodeId` and its descendants,
   * inside the caller's transaction (leave / kick / ban). Hygiene only:
   * mention resolution intersects with effective members anyway.
   */
  async removeUserFromNodeGroups(tx: RoomTx, nodeId: string, userId: string): Promise<void> {
    const closure = (await tx.orm.public.RoomClosure.where({
      ancestorId: nodeId,
    }).all()) as Array<{ descendantId: string }>;
    const nodeIds = [nodeId, ...closure.map((row) => row.descendantId)];

    const groups = (await tx.orm.public.RoomGroup.where((f) =>
      f.nodeId.in(nodeIds),
    ).all()) as GroupRow[];
    if (groups.length === 0) {
      return;
    }

    await tx.orm.public.RoomGroupMember.where((f) =>
      and(f.groupId.in(groups.map((g) => g.id)), f.userId.eq(userId)),
    ).deleteAndCount();
  }

  /**
   * Refuse a room move that would put two same-named groups on one chain:
   * a group in the moved subtree against a group on one of the new ancestors.
   */
  async assertNoNameConflictOnMove(
    subtreeIds: readonly string[],
    newAncestorIds: readonly string[],
  ): Promise<void> {
    if (newAncestorIds.length === 0) {
      return;
    }

    const moved = (await this.prisma.orm.public.RoomGroup.where((f) =>
      f.nodeId.in([...subtreeIds]),
    ).all()) as GroupRow[];
    if (moved.length === 0) {
      return;
    }
    const above = (await this.prisma.orm.public.RoomGroup.where((f) =>
      and(f.nodeId.in([...newAncestorIds]), not(f.nodeId.in([...subtreeIds]))),
    ).all()) as GroupRow[];

    if (
      moved.some((group) =>
        isNameTaken(
          group.name,
          above.map((g) => g.name),
        ),
      )
    ) {
      throw new GroupNameTakenError();
    }
  }

  private async findManageableGroupOrThrow(
    actor: PermissionPrincipal,
    roomId: string,
    groupId: string,
  ): Promise<GroupRow> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    await this.findRoomOrThrow(roomId);
    const group = await this.findVisibleGroupOrThrow(roomId, groupId);
    await this.permissions.assertCan(actor, group.nodeId, 'room.manage_groups');

    return group;
  }

  /** The group, provided it is defined on `roomId` or one of its ancestors. */
  private async findVisibleGroupOrThrow(roomId: string, groupId: string): Promise<GroupRow> {
    const group = (await this.prisma.orm.public.RoomGroup.where({
      id: groupId,
    }).first()) as GroupRow | null;
    if (!group) {
      throw new GroupNotFoundError();
    }
    const nodeIds = await this.ancestorsAndSelf(roomId);
    if (!nodeIds.includes(group.nodeId)) {
      throw new GroupNotFoundError();
    }

    return group;
  }

  /** Throws when `name` is used by another group on the ancestor/descendant chain of `nodeId`. */
  private async assertNameFree(
    nodeId: string,
    name: string,
    exceptGroupId: string | null,
  ): Promise<void> {
    const [ancestors, descendants] = await Promise.all([
      this.ancestorsAndSelf(nodeId),
      this.descendantsAndSelf(nodeId),
    ]);
    const chain = [...new Set([...ancestors, ...descendants])];
    const groups = (await this.prisma.orm.public.RoomGroup.where((f) =>
      f.nodeId.in(chain),
    ).all()) as GroupRow[];

    const names = groups.filter((g) => g.id !== exceptGroupId).map((g) => g.name);
    if (isNameTaken(name, names)) {
      throw new GroupNameTakenError();
    }
  }

  private async assertEffectiveMembers(nodeId: string, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const effective = new Set((await this.effectiveMembers.listAll(nodeId)).map((m) => m.userId));
    if (userIds.some((userId) => !effective.has(userId))) {
      throw new GroupMemberNotMemberError();
    }
  }

  private async ancestorsAndSelf(roomId: string): Promise<string[]> {
    const rows = (await this.prisma.orm.public.RoomClosure.where({
      descendantId: roomId,
    }).all()) as Array<{ ancestorId: string }>;

    return [...new Set([roomId, ...rows.map((row) => row.ancestorId)])];
  }

  private async descendantsAndSelf(roomId: string): Promise<string[]> {
    const rows = (await this.prisma.orm.public.RoomClosure.where({
      ancestorId: roomId,
    }).all()) as Array<{ descendantId: string }>;

    return [...new Set([roomId, ...rows.map((row) => row.descendantId)])];
  }

  private async findRoomOrThrow(id: string): Promise<void> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as {
      deletedAt: string | null;
    } | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }
  }

  private async membersOf(groupIds: readonly string[]): Promise<Map<string, string[]>> {
    const byGroup = new Map<string, string[]>();
    if (groupIds.length === 0) {
      return byGroup;
    }
    const rows = (await this.prisma.orm.public.RoomGroupMember.where((f) =>
      f.groupId.in([...groupIds]),
    ).all()) as GroupMemberRow[];
    for (const row of rows) {
      byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row.userId]);
    }

    return byGroup;
  }

  private toSummary(
    group: GroupRow,
    viewedFromRoomId: string,
    members: Map<string, string[]>,
    callerId: string,
  ): GroupSummary {
    const userIds = members.get(group.id) ?? [];

    return {
      id: group.id,
      nodeId: group.nodeId,
      name: group.name,
      memberCount: userIds.length,
      inherited: group.nodeId !== viewedFromRoomId,
      isMember: userIds.includes(callerId),
    };
  }

  private async toDetail(
    group: GroupRow,
    viewedFromRoomId: string,
    callerId: string,
  ): Promise<GroupDetail> {
    const members = await this.membersOf([group.id]);
    const userIds = [...(members.get(group.id) ?? [])].sort();
    const summaries = await this.userSummaries.readMany(userIds);

    return {
      ...this.toSummary(group, viewedFromRoomId, members, callerId),
      members: userIds.flatMap((id) => {
        const summary = summaries.get(id);

        return summary ? [summary] : [];
      }),
    };
  }
}
