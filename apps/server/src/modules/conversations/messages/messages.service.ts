import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { ulid } from 'ulid';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  MessageAlreadyPinnedError,
  MessageBodyInvalidError,
  MessageBodyTooLongError,
  MessageMentionNotMemberError,
  MessageNotFoundError,
  MessageNotPinnedError,
  MessageReplyNotInRoomError,
  RoomNotFoundError,
  RoomReadOnlyError,
} from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { type MessageRow, type MessageView, toMessageView } from './message.view.js';
import type { SendMessage } from './messages.dto.js';
import type { MessagePinRow, MessagePinView } from './pin.view.js';
import { RestrictedMarkdownError, validateRestrictedMarkdown } from './restricted-markdown.js';

/** Messages: send, restricted Markdown, mentions, replies, pins (technical.md §11, issue #7). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  async sendMessage(
    actor: PermissionPrincipal,
    roomId: string,
    input: SendMessage,
  ): Promise<MessageView> {
    await this.permissions.assertCan(actor, roomId, 'room.post');
    const room = await this.findRoomOrThrow(roomId);
    if (room.readOnly && !(await this.permissions.can(actor, roomId, 'room.edit_any'))) {
      throw new RoomReadOnlyError();
    }

    this.validateBody(input.body);

    if (input.replyToId) {
      const parent = (await this.prisma.orm.public.Message.where({
        id: input.replyToId,
        roomId,
      }).first()) as unknown;
      if (!parent) {
        throw new MessageReplyNotInRoomError();
      }
    }

    const mentions = [...new Set(input.mentions ?? [])];
    for (const userId of mentions) {
      const membership = (await this.prisma.orm.public.Membership.where({
        roomId,
        userId,
      }).first()) as unknown;
      if (!membership) {
        throw new MessageMentionNotMemberError();
      }
    }

    const id = ulid();
    const message = await this.prisma.transaction(async (tx) => {
      const event = await this.eventLog.append(tx, {
        roomId,
        type: 'message_created',
        senderId: actor.userId,
        content: { messageId: id, body: input.body, replyToId: input.replyToId ?? null, mentions },
      });

      const row = (await tx.orm.public.Message.create({
        id,
        roomId,
        seq: event.seq,
        authorId: actor.userId,
        body: input.body,
        replyToId: input.replyToId ?? null,
        editedAt: null,
        redactedAt: null,
        redactedById: null,
        hiddenAt: null,
      })) as MessageRow;

      for (const userId of mentions) {
        await tx.orm.public.MessageMention.create({ messageId: id, userId });
      }

      return row;
    });

    return toMessageView(message, mentions);
  }

  /**
   * Edit a message's body (technical.md §12, issue #8). `room.edit_own` (the
   * author, within `messages.edit_window` if set) or `room.edit_any`. Emits
   * `message_edited { editedAt }` — never the previous body; no version
   * history is retained.
   */
  async editMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
    body: string,
  ): Promise<MessageView> {
    const message = await this.findMessageOrThrow(roomId, messageId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }
    await this.assertCanEditOrThrow(actor, roomId, message);
    this.validateBody(body);

    const now = new Date().toISOString();
    const updated = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.Message.where({ id: messageId }).update({
        body,
        editedAt: now,
      })) as MessageRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'message_edited',
        senderId: actor.userId,
        content: { editedAt: now },
      });

      return row;
    });

    return toMessageView(updated, await this.mentionsFor(messageId));
  }

  /**
   * Delete a message (technical.md §12, issue #8). `room.delete_own` (the
   * author) or `room.delete_any`. Clears `body`, removes `message_mention`
   * and `message_pin` rows, and rewrites the original `message_created`
   * event into a tombstone (same `seq`, no new event) — reused by the
   * retention worker (#12) via {@link redactMessage}.
   */
  async deleteMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<void> {
    const message = await this.findMessageOrThrow(roomId, messageId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }
    const isAuthor = message.authorId === actor.userId;
    const allowed = isAuthor && (await this.permissions.can(actor, roomId, 'room.delete_own'));
    if (!allowed) {
      await this.permissions.assertCan(actor, roomId, 'room.delete_any');
    }

    await this.redactMessage(roomId, message, actor.userId, 'user');
  }

  /** Shared redact core (technical.md §12-§13): also the retention worker's delete-mode helper. */
  async redactMessage(
    roomId: string,
    message: MessageRow,
    redactedById: string | null,
    reason: 'user' | 'retention',
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Message.where({ id: message.id }).update({
        body: '',
        redactedAt: now,
        redactedById,
      });
      await tx.orm.public.MessageMention.where((f) => f.messageId.eq(message.id)).delete();
      await tx.orm.public.MessagePin.where({ roomId, messageId: message.id }).delete();
      await tx.orm.public.Reaction.where((f) => f.messageId.eq(message.id)).delete();
      await tx.orm.public.RoomEvent.where({ roomId, seq: message.seq }).update({
        type: 'message_redacted',
        content: { reason },
      });
    });
  }

  async getMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<MessageView> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    const message = await this.findMessageOrThrow(roomId, messageId);
    const mentions = await this.mentionsFor(messageId);

    return toMessageView(message, mentions);
  }

  async pin(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<MessagePinView> {
    await this.permissions.assertCan(actor, roomId, 'room.pin');
    await this.findMessageOrThrow(roomId, messageId);

    const existing = (await this.prisma.orm.public.MessagePin.where({
      roomId,
      messageId,
    }).first()) as unknown;
    if (existing) {
      throw new MessageAlreadyPinnedError();
    }

    const pin = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.MessagePin.create({
        roomId,
        messageId,
        pinnedById: actor.userId,
      })) as MessagePinRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'pin_added',
        senderId: actor.userId,
        content: { messageId },
      });

      return row;
    });

    return pin;
  }

  async unpin(actor: PermissionPrincipal, roomId: string, messageId: string): Promise<void> {
    await this.permissions.assertCan(actor, roomId, 'room.pin');

    const existing = (await this.prisma.orm.public.MessagePin.where({
      roomId,
      messageId,
    }).first()) as unknown;
    if (!existing) {
      throw new MessageNotPinnedError();
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.MessagePin.where({ roomId, messageId }).delete();
      await this.eventLog.append(tx, {
        roomId,
        type: 'pin_removed',
        senderId: actor.userId,
        content: { messageId },
      });
    });
  }

  async listPins(actor: PermissionPrincipal, roomId: string): Promise<MessagePinView[]> {
    await this.permissions.assertCan(actor, roomId, 'room.read');

    const rows = (await this.prisma.orm.public.MessagePin.where((f) => f.roomId.eq(roomId))
      .orderBy((f) => f.pinnedAt.desc())
      .all()) as MessagePinRow[];

    return rows;
  }

  private async findRoomOrThrow(id: string): Promise<{ id: string; readOnly: boolean }> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as {
      id: string;
      readOnly: boolean;
      deletedAt: string | null;
    } | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }

    return row;
  }

  private async findMessageOrThrow(roomId: string, messageId: string): Promise<MessageRow> {
    const row = (await this.prisma.orm.public.Message.where((f) =>
      and(f.id.eq(messageId), f.roomId.eq(roomId)),
    ).first()) as MessageRow | null;
    if (!row) {
      throw new MessageNotFoundError();
    }

    return row;
  }

  private validateBody(body: string): void {
    const maxLength = this.config.get('messages.body_max_length');
    if (body.length > maxLength) {
      throw new MessageBodyTooLongError();
    }
    try {
      validateRestrictedMarkdown(body);
    } catch (error) {
      if (error instanceof RestrictedMarkdownError) {
        throw new MessageBodyInvalidError(error.reason);
      }
      throw error;
    }
  }

  /** `room.edit_own` (author, within `messages.edit_window` if set) or `room.edit_any`. */
  private async assertCanEditOrThrow(
    actor: PermissionPrincipal,
    roomId: string,
    message: MessageRow,
  ): Promise<void> {
    if (message.authorId === actor.userId) {
      const canEditOwn = await this.permissions.can(actor, roomId, 'room.edit_own');
      const editWindow = this.config.get('messages.edit_window');
      const withinWindow =
        editWindow === null ||
        Date.now() <= new Date(message.createdAt).getTime() + editWindow * 1000;
      if (canEditOwn && withinWindow) {
        return;
      }
    }

    await this.permissions.assertCan(actor, roomId, 'room.edit_any');
  }

  private async mentionsFor(messageId: string): Promise<string[]> {
    const rows = (await this.prisma.orm.public.MessageMention.where({
      messageId,
    }).all()) as Array<{ userId: string }>;

    return rows.map((r) => r.userId);
  }
}
