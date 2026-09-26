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
import { GroupsService } from '../groups/groups.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import {
  type RoomListItemRow,
  type RoomListView,
  type RoomPreview,
  type RoomPreviewJoinRequestRow,
  type RoomRow,
  type RoomView,
  toRoomListItem,
  toRoomPreview,
  toRoomView,
  UNREAD_COUNT_CAP,
} from './room.view.js';
import type { CreateChannel, CreateSpace, MoveRoom, UpdateRoom } from './rooms.dto.js';

export interface RoomActor {
  userId: string;
  isOwner: boolean;
}

/**
 * Room CRUD and hierarchy (technical.md §4-§5, §7, conversation-data-model.md,
 * issue #1). Invitations, `dm` / `group_dm` creation and the public directory
 * each arrive with their own issue (#4-#6); this service only ever creates
 * `space` and `channel` rooms, and enrols the creator as their first member.
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly groups: GroupsService,
  ) {}

  async createSpace(actor: RoomActor, input: CreateSpace): Promise<RoomView> {
    if (input.parentId) {
      await this.findParentOrThrow(input.parentId);
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
    const parent = await this.findParentOrThrow(input.parentId);
    await this.permissions.assertCan(actor, input.parentId, 'space.create_child');
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

  /**
   * The caller's spaces and channels (`GET /rooms`), in one query: rooms with
   * an explicit membership (`member`), their descendants reached through that
   * membership (`inherited`, the nearest ancestor membership giving the role,
   * as {@link PermissionsService.effectiveRole} does), and the ancestor spaces
   * needed to place them in the tree (`context`, `role: null`). Overrides are
   * not evaluated: an inherited room with a `room.read` deny is still listed.
   * Each listed room also carries `unreadCount` (capped `message_created`
   * events from others since the caller's marker, or since they joined).
   */
  async listMine(actor: RoomActor): Promise<RoomListView> {
    const plan = this.prisma.raw.sql`
      WITH mine AS (
        SELECT room_id, role, joined_at FROM membership WHERE user_id = ${actor.userId}
      ),
      reached AS (
        SELECT room_id, role, joined_at, 0 AS depth FROM mine
        UNION ALL
        SELECT c.descendant_id, mine.role, mine.joined_at, c.depth
        FROM mine JOIN room_closure c ON c.ancestor_id = mine.room_id AND c.depth > 0
      ),
      reach AS (
        SELECT DISTINCT ON (r.id) r.id AS room_id, reached.role, reached.joined_at, reached.depth
        FROM reached JOIN room r ON r.id = reached.room_id
        WHERE r.type IN ('space', 'channel') AND r.deleted_at IS NULL
        ORDER BY r.id, reached.depth ASC
      ),
      context AS (
        SELECT DISTINCT c.ancestor_id AS room_id
        FROM reach
        JOIN room_closure c ON c.descendant_id = reach.room_id AND c.depth > 0
        WHERE c.ancestor_id NOT IN (SELECT room_id FROM reach)
      )
      SELECT r.id, r.type, r.parent_id AS "parentId", r.visibility, r.slug, r.name, r.topic,
             r.avatar_blob_id AS "avatarBlobId", r.default_role AS "defaultRole",
             r.read_only AS "readOnly", r.origin_server AS "originServer",
             r.last_seq AS "lastSeq", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
             reach.role AS "role",
             CASE WHEN reach.room_id IS NULL THEN 'context'
                  WHEN reach.depth = 0 THEN 'member'
                  ELSE 'inherited' END AS "access",
             unread.n AS "unreadCount"
      FROM room r
      LEFT JOIN reach ON reach.room_id = r.id
      LEFT JOIN read_marker rm ON rm.room_id = r.id AND rm.user_id = ${actor.userId}
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS n FROM (
          SELECT 1 FROM room_event e
          WHERE e.room_id = r.id AND e.type = 'message_created'
            AND e.sender_id IS DISTINCT FROM ${actor.userId}
            AND e.created_at >= reach.joined_at
            AND (rm.seq IS NULL OR e.seq > rm.seq)
          LIMIT ${UNREAD_COUNT_CAP}
        ) capped
      ) unread ON reach.room_id IS NOT NULL
      WHERE (reach.room_id IS NOT NULL OR r.id IN (SELECT room_id FROM context))
        AND r.type IN ('space', 'channel') AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC, r.id ASC
    `
      .returnsRow({
        id: { codecId: 'pg/text@1', nullable: false },
        type: { codecId: 'pg/text@1', nullable: false },
        parentId: { codecId: 'pg/text@1', nullable: true },
        visibility: { codecId: 'pg/text@1', nullable: false },
        slug: { codecId: 'pg/text@1', nullable: true },
        name: { codecId: 'pg/text@1', nullable: true },
        topic: { codecId: 'pg/text@1', nullable: true },
        avatarBlobId: { codecId: 'pg/text@1', nullable: true },
        defaultRole: { codecId: 'pg/text@1', nullable: false },
        readOnly: { codecId: 'pg/bool@1', nullable: false },
        originServer: { codecId: 'pg/text@1', nullable: false },
        lastSeq: { codecId: 'pg/int8@1', nullable: false },
        createdAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
        updatedAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
        role: { codecId: 'pg/text@1', nullable: true },
        access: { codecId: 'pg/text@1', nullable: false },
        unreadCount: { codecId: 'pg/int4@1', nullable: true },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as RoomListItemRow[];

    return { items: rows.map(toRoomListItem) };
  }

  async getRoom(actor: RoomActor, id: string): Promise<RoomView> {
    await this.permissions.assertCan(actor, id, 'room.read');

    return toRoomView(await this.findRoomOrThrow(id));
  }

  /**
   * What a non-member of an `invite` room may see to ask to join it. Any other
   * room (`public`, `private`, deleted, unknown) is a `404`, so a `private`
   * room is never revealed.
   */
  async getPreview(actor: RoomActor, id: string): Promise<RoomPreview> {
    const room = (await this.prisma.orm.public.Room.where({ id }).first()) as RoomRow | null;
    if (!room || room.deletedAt || room.visibility !== 'invite') {
      throw new RoomNotFoundError();
    }

    const joinRequest = (await this.prisma.orm.public.RoomJoinRequest.where({
      roomId: id,
      userId: actor.userId,
    }).first()) as RoomPreviewJoinRequestRow | null;

    return toRoomPreview(room, joinRequest);
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
        // Only the fields the caller actually set, per docs/protocol/rooms-and-permissions.md
        // ("only the fields set on the current state at write time") — not the full merged
        // state, which would misrepresent a `PATCH { readOnly: true }` as also having
        // touched `name` / `topic` / `visibility`.
        content: {
          ...(patch.name !== undefined && { name: nextName }),
          ...(patch.topic !== undefined && { topic: nextTopic }),
          ...(patch.visibility !== undefined && { visibility: nextVisibility }),
          ...(patch.readOnly !== undefined && { readOnly: nextReadOnly }),
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
    await this.groups.assertNoNameConflictOnMove(
      subtreeIds,
      newAncestorRows.map((r) => r.ancestorId),
    );
    const now = new Date().toISOString();

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomClosure.where((f) =>
        and(f.descendantId.in(subtreeIds), not(f.ancestorId.in(subtreeIds))),
      ).deleteAndCount();

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

  /** Same lookup as {@link findRoomOrThrow}, but `422 room.parent_not_found` — a missing
   * `parentId` on create is a validation problem with the request, not a 404 on some
   * resource the client asked for directly. */
  private async findParentOrThrow(id: string): Promise<RoomRow> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as RoomRow | null;
    if (!row || row.deletedAt) {
      throw new RoomParentNotFoundError();
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

      // The creator becomes a member so a membership-based `GET /rooms` lists
      // the room to them (`space_admin` for a space, `room_admin` for a channel).
      const creatorRole = input.type === 'space' ? 'space_admin' : 'room_admin';
      await tx.orm.public.Membership.create({
        roomId: room.id,
        userId: actor.userId,
        role: creatorRole,
        invitedById: null,
      });

      await this.eventLog.append(tx, {
        roomId: room.id,
        type: 'member_joined',
        senderId: actor.userId,
        content: { userId: actor.userId, role: creatorRole },
      });

      return room;
    })) as RoomRow;

    await this.permissions.invalidateSubtree(created.id);

    // Re-read: the row returned by the insert predates the two events just
    // appended, so its `lastSeq` would be stale.
    return toRoomView(await this.findRoomOrThrow(created.id));
  }
}
