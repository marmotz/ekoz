import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  MessageNotFoundError,
  ReactionAlreadyExistsError,
  ReactionNotFoundError,
} from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';

/** Reactions (technical.md §11, issue #9). */
@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  async add(actor: PermissionPrincipal, messageId: string, emoji: string): Promise<void> {
    const roomId = await this.roomIdForMessage(messageId);
    await this.permissions.assertCan(actor, roomId, 'room.react');

    const existing = (await this.prisma.orm.public.Reaction.where({
      messageId,
      userId: actor.userId,
      emoji,
    }).first()) as unknown;
    if (existing) {
      throw new ReactionAlreadyExistsError();
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Reaction.create({ messageId, userId: actor.userId, emoji });
      await this.eventLog.append(tx, {
        roomId,
        type: 'reaction_added',
        senderId: actor.userId,
        content: { messageId, emoji },
      });
    });
  }

  async remove(actor: PermissionPrincipal, messageId: string, emoji: string): Promise<void> {
    const roomId = await this.roomIdForMessage(messageId);
    await this.permissions.assertCan(actor, roomId, 'room.react');

    const existing = (await this.prisma.orm.public.Reaction.where({
      messageId,
      userId: actor.userId,
      emoji,
    }).first()) as unknown;
    if (!existing) {
      throw new ReactionNotFoundError();
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Reaction.where((f) =>
        and(f.messageId.eq(messageId), f.userId.eq(actor.userId), f.emoji.eq(emoji)),
      ).delete();
      await this.eventLog.append(tx, {
        roomId,
        type: 'reaction_removed',
        senderId: actor.userId,
        content: { messageId, emoji },
      });
    });
  }

  private async roomIdForMessage(messageId: string): Promise<string> {
    const message = (await this.prisma.orm.public.Message.where({
      id: messageId,
    }).first()) as { roomId: string } | null;
    if (!message) {
      throw new MessageNotFoundError();
    }

    return message.roomId;
  }
}
