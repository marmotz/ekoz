import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { DmSelfError } from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { type RoomRow, type RoomView, toRoomView } from '../rooms/room.view.js';
import type { CreateDm, CreateGroupDm } from './dm.dto.js';

/**
 * Direct and group conversations (technical.md §7, issue #5). `dm` / `group_dm`
 * rooms sit outside the hierarchy (`parentId = null`, closure holds only the
 * self row) and are never listed in the directory (`DirectoryService` already
 * filters to `type = "channel"`).
 *
 * The "light `room_admin`" the technical design grants a `group_dm` creator is
 * implemented as an ordinary `member` role plus a per-user
 * `room.manage_members` override — reusing the full `room_admin` role would
 * also grant `edit_any` / `delete_any` / `manage_roles` / ..., which the design
 * explicitly scopes down to member management only.
 */
@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
  ) {}

  async createDm(actor: PermissionPrincipal, input: CreateDm): Promise<RoomView> {
    if (input.userId === actor.userId) {
      throw new DmSelfError();
    }

    const dmKey = [actor.userId, input.userId].sort().join(':');
    const existing = (await this.prisma.orm.public.Room.where({ dmKey }).first()) as RoomRow | null;
    if (existing) {
      return toRoomView(existing);
    }

    const room = await this.prisma.transaction(async (tx) => {
      const created = (await tx.orm.public.Room.create({
        type: 'dm',
        parentId: null,
        visibility: 'private',
        slug: null,
        name: null,
        topic: null,
        defaultRole: 'member',
        readOnly: false,
        originServer: this.config.get('server.domain'),
        lastSeq: 0n,
        retention: { mode: 'inherit' },
        dmKey,
        createdById: actor.userId,
      })) as RoomRow;

      await tx.orm.public.RoomClosure.create({
        ancestorId: created.id,
        descendantId: created.id,
        depth: 0,
      });

      for (const userId of [actor.userId, input.userId]) {
        await tx.orm.public.Membership.create({
          roomId: created.id,
          userId,
          role: 'member',
          invitedById: null,
        });
      }

      await this.eventLog.append(tx, {
        roomId: created.id,
        type: 'room_created',
        senderId: actor.userId,
        content: { type: 'dm', parentId: null, visibility: 'private', name: null },
      });

      return created;
    });

    return toRoomView(room);
  }

  async createGroupDm(actor: PermissionPrincipal, input: CreateGroupDm): Promise<RoomView> {
    const participantIds = [...new Set([actor.userId, ...input.userIds])];

    const room = await this.prisma.transaction(async (tx) => {
      const created = (await tx.orm.public.Room.create({
        type: 'group_dm',
        parentId: null,
        visibility: 'private',
        slug: null,
        name: input.name ?? null,
        topic: null,
        defaultRole: 'member',
        readOnly: false,
        originServer: this.config.get('server.domain'),
        lastSeq: 0n,
        retention: { mode: 'inherit' },
        dmKey: null,
        createdById: actor.userId,
      })) as RoomRow;

      await tx.orm.public.RoomClosure.create({
        ancestorId: created.id,
        descendantId: created.id,
        depth: 0,
      });

      for (const userId of participantIds) {
        await tx.orm.public.Membership.create({
          roomId: created.id,
          userId,
          role: 'member',
          invitedById: userId === actor.userId ? null : actor.userId,
        });
      }

      await tx.orm.public.RoomMemberPermission.create({
        nodeId: created.id,
        userId: actor.userId,
        capability: 'room.manage_members',
        effect: 'allow',
      });

      await this.eventLog.append(tx, {
        roomId: created.id,
        type: 'room_created',
        senderId: actor.userId,
        content: {
          type: 'group_dm',
          parentId: null,
          visibility: 'private',
          name: input.name ?? null,
        },
      });

      return created;
    });

    return toRoomView(room);
  }
}
