import { Injectable } from '@nestjs/common';
import { and, not } from '@prisma/orm-postgres/orm-client';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  RoomCycleError,
  RoomInvalidParentTypeError,
  RoomMaxDepthExceededError,
  RoomNotEmptyError,
  RoomNotFoundError,
  RoomParentNotFoundError,
  RoomPermissionDeniedError,
} from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { type RoomRow, type RoomView, toRoomView } from './room.view.js';
import type { CreateChannel, CreateSpace, MoveRoom, UpdateRoom } from './rooms.dto.js';

export interface RoomActor {
  userId: string;
  isOwner: boolean;
}

/**
 * Room CRUD and hierarchy (technical.md §4-§5, §7, conversation-data-model.md,
 * issue #1). `Membership`, invitations, `dm` / `group_dm` creation and the
 * public directory each arrive with their own issue (#4-#6); this service only
 * ever creates `space` and `channel` rooms.
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  async createSpace(actor: RoomActor, input: CreateSpace): Promise<RoomView> {
    if (input.parentId) {
      await this.permissions.assertCan(actor, input.parentId, 'space.create_child');
    } else if (!actor.isOwner) {
      // No parent node to check a capability against yet — provisional
      // owner-only guard for a root space, per issue #1.
      throw new RoomPermissionDeniedError('Only a server owner may create a root space.');
    }

    return this.createNode(actor, {
      type: 'space',
      parentId: input.parentId ?? null,
      visibility: input.visibility,
      name: input.name,
      topic: input.topic ?? null,
      slug: null,
    });
  }

  async createChannel(actor: RoomActor, input: CreateChannel): Promise<RoomView> {
    await this.permissions.assertCan(actor, input.parentId, 'space.create_child');

    const parent = await this.findRoomOrThrow(input.parentId);
    if (parent.type !== 'space') {
      throw new RoomInvalidParentTypeError();
    }

    return this.createNode(actor, {
      type: 'channel',
      parentId: input.parentId,
      visibility: input.visibility,
      name: input.name,
      topic: input.topic ?? null,
      slug: input.slug ?? null,
    });
  }

  async getRoom(actor: RoomActor, id: string): Promise<RoomView> {
    await this.permissions.assertCan(actor, id, 'room.read');

    return toRoomView(await this.findRoomOrThrow(id));
  }

  async getChildren(actor: RoomActor, id: string): Promise<RoomView[]> {
    await this.permissions.assertCan(actor, id, 'room.read');
    await this.findRoomOrThrow(id);

    const rows = (await this.prisma.orm.public.Room.where((f) =>
      and(f.parentId.eq(id), f.deletedAt.isNull()),
    )
      .orderBy((f) => f.createdAt.asc())
      .all()) as RoomRow[];

    return rows.map(toRoomView);
  }

  async updateRoom(actor: RoomActor, id: string, patch: UpdateRoom): Promise<RoomView> {
    await this.permissions.assertCan(actor, id, 'space.manage');
    const room = await this.findRoomOrThrow(id);

    const nextName = patch.name !== undefined ? patch.name : room.name;
    const nextTopic = patch.topic !== undefined ? patch.topic : room.topic;
    const nextVisibility = patch.visibility ?? room.visibility;
    const nextReadOnly = patch.readOnly ?? room.readOnly;

    const now = new Date().toISOString();
    const updated = (await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.Room.where({ id }).update({
        name: nextName,
        topic: nextTopic,
        visibility: nextVisibility,
        readOnly: nextReadOnly,
        updatedAt: now,
      })) as RoomRow;

      await this.eventLog.append(tx, {
        roomId: id,
        type: 'room_updated',
        senderId: actor.userId,
        content: {
          name: nextName,
          topic: nextTopic,
          visibility: nextVisibility,
          readOnly: nextReadOnly,
          defaultRole: room.defaultRole,
        },
      });

      return row;
    })) as RoomRow;

    this.permissions.invalidateRoom(id);

    return toRoomView(updated);
  }

  /**
   * Move `id` under `newParentId` (`null` = detach to root — spaces only),
   * rewriting `RoomClosure` for the whole subtree (technical.md §5).
   */
  async moveRoom(actor: RoomActor, id: string, input: MoveRoom): Promise<RoomView> {
    await this.permissions.assertCan(actor, id, 'space.manage');
    const room = await this.findRoomOrThrow(id);
    const newParentId = input.parentId;

    if (newParentId === null && room.type === 'channel') {
      throw new RoomInvalidParentTypeError('A channel must stay attached to a space.');
    }

    if (newParentId !== null) {
      if (newParentId === id) {
        throw new RoomCycleError();
      }
      const newParent = await this.findRoomOrThrow(newParentId).catch(() => null);
      if (!newParent) {
        throw new RoomParentNotFoundError();
      }
      if (room.type === 'channel' && newParent.type !== 'space') {
        throw new RoomInvalidParentTypeError();
      }

      const isDescendant = (await this.prisma.orm.public.RoomClosure.where((f) =>
        and(f.ancestorId.eq(id), f.descendantId.eq(newParentId)),
      ).first()) as unknown;
      if (isDescendant) {
        throw new RoomCycleError();
      }
    }

    const maxDepth = this.config.get('rooms.max_depth');
    const subtreeRows = (await this.prisma.orm.public.RoomClosure.where((f) =>
      f.ancestorId.eq(id),
    ).all()) as Array<{
      descendantId: string;
      depth: number;
    }>;
    const maxRelativeDepth = Math.max(...subtreeRows.map((r) => r.depth));
    const newAncestorRows =
      newParentId === null
        ? []
        : ((await this.prisma.orm.public.RoomClosure.where((f) =>
            f.descendantId.eq(newParentId),
          ).all()) as Array<{
            ancestorId: string;
            depth: number;
          }>);
    const newDepthForRoom =
      newParentId === null ? 0 : Math.max(...newAncestorRows.map((r) => r.depth)) + 1;
    if (newDepthForRoom + maxRelativeDepth > maxDepth) {
      throw new RoomMaxDepthExceededError();
    }

    const subtreeIds = subtreeRows.map((r) => r.descendantId);
    const now = new Date().toISOString();

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomClosure.where((f) =>
        and(f.descendantId.in(subtreeIds), not(f.ancestorId.in(subtreeIds))),
      ).delete();

      const newRows = newAncestorRows.flatMap((ancestor) =>
        subtreeRows.map((sub) => ({
          ancestorId: ancestor.ancestorId,
          descendantId: sub.descendantId,
          depth: ancestor.depth + 1 + sub.depth,
        })),
      );
      if (newRows.length > 0) {
        const plan = tx.sql.public.room_closure
          .insert(
            newRows.map((r) => ({
              ancestor_id: r.ancestorId,
              descendant_id: r.descendantId,
              depth: r.depth,
            })),
          )
          .build();
        await tx.execute(plan);
      }

      await tx.orm.public.Room.where({ id }).update({ parentId: newParentId, updatedAt: now });

      await this.eventLog.append(tx, {
        roomId: id,
        type: 'room_moved',
        senderId: actor.userId,
        content: { oldParentId: room.parentId, newParentId },
      });
    });

    for (const subId of subtreeIds) {
      this.permissions.invalidateRoom(subId);
    }

    return toRoomView(await this.findRoomOrThrow(id));
  }

  /** Soft delete, blocked while the room still has live children (technical.md §5). */
  async deleteRoom(actor: RoomActor, id: string): Promise<void> {
    await this.permissions.assertCan(actor, id, 'space.manage');
    await this.findRoomOrThrow(id);

    const childCount = (await this.prisma.orm.public.Room.where((f) =>
      and(f.parentId.eq(id), f.deletedAt.isNull()),
    ).all()) as unknown[];
    if (childCount.length > 0) {
      throw new RoomNotEmptyError();
    }

    const now = new Date().toISOString();
    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Room.where({ id }).update({ deletedAt: now, updatedAt: now });
      await this.eventLog.append(tx, {
        roomId: id,
        type: 'room_deleted',
        senderId: actor.userId,
        content: {},
      });
    });

    this.permissions.invalidateRoom(id);
  }

  private async findRoomOrThrow(id: string): Promise<RoomRow> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as RoomRow | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }

    return row;
  }

  private async createNode(
    actor: RoomActor,
    input: {
      type: 'space' | 'channel';
      parentId: string | null;
      visibility: CreateSpace['visibility'];
      name: string;
      topic: string | null;
      slug: string | null;
    },
  ): Promise<RoomView> {
    if (input.parentId) {
      const parentAncestors = (await this.prisma.orm.public.RoomClosure.where((f) =>
        f.descendantId.eq(input.parentId as string),
      ).all()) as Array<{ ancestorId: string; depth: number }>;
      const parentDepth = Math.max(...parentAncestors.map((r) => r.depth), 0);
      if (parentDepth + 1 > this.config.get('rooms.max_depth')) {
        throw new RoomMaxDepthExceededError();
      }
    }

    const now = new Date().toISOString();
    const created = (await this.prisma.transaction(async (tx) => {
      const room = (await tx.orm.public.Room.create({
        type: input.type,
        parentId: input.parentId,
        visibility: input.visibility,
        slug: input.slug,
        name: input.name,
        topic: input.topic,
        defaultRole: 'member',
        readOnly: false,
        originServer: this.config.get('server.domain'),
        lastSeq: 0n,
        retention: { mode: 'inherit' },
        createdById: actor.userId,
        updatedAt: now,
      })) as RoomRow;

      await tx.orm.public.RoomClosure.create({
        ancestorId: room.id,
        descendantId: room.id,
        depth: 0,
      });

      if (input.parentId) {
        const parentAncestors = (await tx.orm.public.RoomClosure.where((f) =>
          f.descendantId.eq(input.parentId as string),
        ).all()) as Array<{ ancestorId: string; depth: number }>;
        for (const ancestor of parentAncestors) {
          await tx.orm.public.RoomClosure.create({
            ancestorId: ancestor.ancestorId,
            descendantId: room.id,
            depth: ancestor.depth + 1,
          });
        }
      }

      await this.eventLog.append(tx, {
        roomId: room.id,
        type: 'room_created',
        senderId: actor.userId,
        content: {
          type: input.type,
          parentId: input.parentId,
          visibility: input.visibility,
          name: input.name,
        },
      });

      return room;
    })) as RoomRow;

    return toRoomView(created);
  }
}
