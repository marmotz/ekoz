import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { ulid } from 'ulid';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  MessageAlreadyPinnedError,
  MessageBodyInvalidError,
  MessageBodyTooLongError,
  MessageNotFoundError,
  MessageNotPinnedError,
  MessageReplyNotInRoomError,
  RoomNotFoundError,
  RoomReadOnlyError,
} from '../conversations.errors.js';
import { EventLogService, type RoomTx } from '../events/event-log.service.js';
import { HistoryFloorService } from '../membership/history-floor.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import {
  dedupeMentions,
  inputTarget,
  type MentionsMe,
  type MentionTarget,
  type MentionTargetRow,
  mentionKey,
  toMentionTarget,
} from './mention.types.js';
import { MentionResolver, type ResolvedMention } from './mention-resolver.js';
import {
  groupReactions,
  type MessageReaction,
  type MessageRow,
  type MessageView,
  type ReactionRow,
  toMessageView,
} from './message.view.js';
import type { EditMessage, ListMessagesQuery, MessagePage, SendMessage } from './messages.dto.js';
import type { MessagePinRow, MessagePinView } from './pin.view.js';
import { RestrictedMarkdownError, validateRestrictedMarkdown } from './restricted-markdown.js';

/** Default `limit` of `GET /rooms/:id/messages`, capped by `messages.max_page`. */
const DEFAULT_PAGE_SIZE = 50;

interface Window {
  items: MessageRow[];
  hasMore: boolean;
  hasMoreNewer: boolean;
}

/** Messages: send, restricted Markdown, mentions, replies, pins (technical.md §11, issue #7). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly mentionResolver: MentionResolver,
    private readonly historyFloor: HistoryFloorService,
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

    const resolved = await this.mentionResolver.resolve({
      roomId,
      roomType: room.type,
      authorId: actor.userId,
      mentions: input.mentions ?? [],
    });
    const targets = resolved.map((mention, position) => ({ ...mention, position }));

    const id = ulid();
    const message = await this.prisma.transaction(async (tx) => {
      const event = await this.eventLog.append(tx, {
        roomId,
        type: 'message_created',
        senderId: actor.userId,
        content: {
          messageId: id,
          body: input.body,
          replyToId: input.replyToId ?? null,
          mentions: targets.map(toMentionTarget),
        },
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

      await this.writeTargets(tx, id, roomId, event.seq, targets);
      if (room.type === 'dm') {
        await this.reopenHiddenMemberships(tx, roomId);
      }

      return row;
    });

    return toMessageView(message, targets.map(toMentionTarget));
  }

  /**
   * Edit a message's body and, optionally, its mention targets (technical.md §12,
   * issue #8; web-client-mentions S3). `room.edit_own` (the author, within
   * `messages.edit_window` if set) or `room.edit_any`. Emits
   * `message_edited { messageId, editedAt }` — never the previous body; no version
   * history is retained.
   *
   * `mentions` absent leaves the targets alone. Present, it is the full new list:
   * a kept target keeps its token and audience, a removed one loses its
   * recipients, an added one is resolved now with recipients at the `seq` of the
   * `message_edited` event appended here.
   */
  async editMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
    input: EditMessage,
  ): Promise<MessageView> {
    const message = await this.findMessageOrThrow(roomId, messageId, actor.userId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }
    await this.assertCanEditOrThrow(actor, roomId, message);
    this.validateBody(input.body);

    const existing = await this.loadTargets(messageId);
    let removed: MentionTargetRow[] = [];
    let added: Array<ResolvedMention & { position: number }> = [];
    if (input.mentions !== undefined) {
      const wanted = dedupeMentions(input.mentions);
      const wantedKeys = new Set(wanted.map((m) => mentionKey(m.type, inputTarget(m))));
      const existingKeys = new Set(existing.map((row) => mentionKey(row.type, row.target)));

      removed = existing.filter((row) => !wantedKeys.has(mentionKey(row.type, row.target)));
      const addedInputs = wanted.filter(
        (m) => !existingKeys.has(mentionKey(m.type, inputTarget(m))),
      );
      if (addedInputs.length > 0) {
        const room = await this.findRoomOrThrow(roomId);
        const resolved = await this.mentionResolver.resolve({
          roomId,
          roomType: room.type,
          // The author of the message, not the editor: their own mentions never notify them.
          authorId: message.authorId ?? '',
          mentions: addedInputs,
        });
        const firstPosition = Math.max(-1, ...existing.map((row) => row.position)) + 1;
        added = resolved.map((mention, i) => ({ ...mention, position: firstPosition + i }));
      }
    }

    const now = new Date().toISOString();
    const updated = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.Message.where({ id: messageId }).update({
        body: input.body,
        editedAt: now,
      })) as MessageRow;

      const event = await this.eventLog.append(tx, {
        roomId,
        type: 'message_edited',
        senderId: actor.userId,
        content: { messageId, editedAt: now },
      });

      for (const target of removed) {
        await tx.orm.public.MessageMentionRecipient.where({
          messageId,
          type: target.type,
          target: target.target,
        }).deleteAndCount();
        await tx.orm.public.MessageMentionTarget.where({
          messageId,
          type: target.type,
          target: target.target,
        }).delete();
      }
      await this.writeTargets(tx, messageId, roomId, event.seq, added);

      return row;
    });

    const targets = await this.loadTargets(messageId);
    const mentionsMe = await this.mentionsMeFor(actor.userId, [messageId]);
    const reactions = await this.reactionsForMany([messageId]);

    return toMessageView(
      updated,
      targets.map(toMentionTarget),
      mentionsMe.get(messageId) ?? null,
      reactions.get(messageId) ?? [],
    );
  }

  /**
   * Delete a message (technical.md §12, issue #8). `room.delete_own` (the
   * author) or `room.delete_any`. Clears `body`, removes the mention targets,
   * their recipients and `message_pin` rows, and rewrites the original `message_created`
   * event into a tombstone (same `seq`, no new event) — reused by the
   * retention worker (#12) via {@link redactMessage}. Returns which
   * capability the deletion went through, so the moderation façade (#13)
   * knows whether this was a moderation action (`delete_any`) worth
   * auditing, as opposed to the author deleting their own message.
   */
  async deleteMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<{ authorId: string | null; viaCapability: 'delete_own' | 'delete_any' }> {
    const message = await this.findMessageOrThrow(roomId, messageId, actor.userId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }
    const isAuthor = message.authorId === actor.userId;
    const canDeleteOwn = isAuthor && (await this.permissions.can(actor, roomId, 'room.delete_own'));
    const viaCapability = canDeleteOwn ? 'delete_own' : 'delete_any';
    if (!canDeleteOwn) {
      await this.permissions.assertCan(actor, roomId, 'room.delete_any');
    }

    await this.redactMessage(roomId, message, actor.userId, 'user');

    return { authorId: message.authorId, viaCapability };
  }

  /**
   * Shared redact core (technical.md §12-§13): also the retention worker's delete-mode helper.
   * Besides rewriting the original event in place, it appends `message_deleted` (so
   * connected clients and `/sync` see the deletion) and scrubs the account feed rows
   * that mirrored the original `message_created`, all in one transaction.
   */
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
      await tx.orm.public.MessageMentionTarget.where((f) =>
        f.messageId.eq(message.id),
      ).deleteAndCount();
      await tx.orm.public.MessageMentionRecipient.where((f) =>
        f.messageId.eq(message.id),
      ).deleteAndCount();
      await tx.orm.public.MessagePin.where({ roomId, messageId: message.id }).delete();
      await tx.orm.public.Reaction.where((f) => f.messageId.eq(message.id)).deleteAndCount();
      await tx.orm.public.RoomEvent.where({ roomId, seq: message.seq }).update({
        type: 'message_redacted',
        content: { reason },
      });
      await this.scrubFeedRows(tx, roomId, message.seq, reason);
      await this.eventLog.append(tx, {
        roomId,
        type: 'message_deleted',
        senderId: redactedById,
        content: { messageId: message.id, messageSeq: message.seq.toString(), reason },
      });
    });
  }

  /**
   * One page of history, ascending inside the page. The default and `before`
   * pages are the newest `limit` messages with `seq < before`; `after` is the
   * oldest `limit` messages with `seq > after`; `around` is `floor(limit/2)`
   * messages before `seq` plus the rest from `seq` on. `lastSeq` is read first
   * so the page is at least as recent as it; mentions and reactions are loaded in one
   * query each for the whole page. `hasMore` means "older messages exist", `hasMoreNewer`
   * "newer messages exist" (always `false` for the default and `before` pages).
   */
  async listMessages(
    actor: PermissionPrincipal,
    roomId: string,
    query: ListMessagesQuery,
  ): Promise<MessagePage> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    const room = (await this.prisma.orm.public.Room.where({ id: roomId }).first()) as {
      lastSeq: bigint;
      deletedAt: string | null;
    } | null;
    if (!room || room.deletedAt) {
      throw new RoomNotFoundError();
    }

    const maxPage = this.config.get('messages.max_page');
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, maxPage);
    const floor = await this.historyFloor.floorFor(roomId, actor.userId);

    const window =
      query.after !== undefined
        ? await this.pageAfter(roomId, floor, BigInt(query.after), limit)
        : query.around !== undefined
          ? await this.pageAround(roomId, floor, BigInt(query.around), limit)
          : await this.pageBefore(
              roomId,
              floor,
              query.before === undefined ? null : BigInt(query.before),
              limit,
            );

    const ids = window.items.map((row) => row.id);
    const mentionsByMessage = await this.targetsForMany(ids);
    const mentionsMe = await this.mentionsMeFor(actor.userId, ids);
    const reactionsByMessage = await this.reactionsForMany(
      window.items.filter((row) => !row.redactedAt).map((row) => row.id),
    );

    return {
      items: window.items.map((row) =>
        toMessageView(
          row,
          mentionsByMessage.get(row.id) ?? [],
          mentionsMe.get(row.id) ?? null,
          reactionsByMessage.get(row.id) ?? [],
        ),
      ),
      lastSeq: room.lastSeq.toString(),
      hasMore: window.hasMore,
      hasMoreNewer: window.hasMoreNewer,
    };
  }

  private async pageBefore(
    roomId: string,
    floor: bigint | null,
    before: bigint | null,
    limit: number,
  ): Promise<Window> {
    const rows = (await this.prisma.orm.public.Message.where((f) =>
      and(
        f.roomId.eq(roomId),
        ...(floor === null ? [] : [f.seq.gte(floor)]),
        ...(before === null ? [] : [f.seq.lt(before)]),
      ),
    )
      .orderBy((f) => f.seq.desc())
      .limit(limit + 1)
      .all()) as MessageRow[];

    return {
      items: rows.slice(0, limit).reverse(),
      hasMore: rows.length > limit,
      hasMoreNewer: false,
    };
  }

  private async pageAfter(
    roomId: string,
    floor: bigint | null,
    after: bigint,
    limit: number,
  ): Promise<Window> {
    const rows = (await this.prisma.orm.public.Message.where((f) =>
      and(f.roomId.eq(roomId), f.seq.gt(after), ...(floor === null ? [] : [f.seq.gte(floor)])),
    )
      .orderBy((f) => f.seq.asc())
      .limit(limit + 1)
      .all()) as MessageRow[];
    const items = rows.slice(0, limit);

    return {
      items,
      hasMore: await this.hasOlderThan(roomId, floor, items[0]?.seq ?? after + 1n),
      hasMoreNewer: rows.length > limit,
    };
  }

  private async pageAround(
    roomId: string,
    floor: bigint | null,
    around: bigint,
    limit: number,
  ): Promise<Window> {
    const olderCount = Math.floor(limit / 2);
    const newerCount = limit - olderCount;

    const older = (await this.prisma.orm.public.Message.where((f) =>
      and(f.roomId.eq(roomId), f.seq.lt(around), ...(floor === null ? [] : [f.seq.gte(floor)])),
    )
      .orderBy((f) => f.seq.desc())
      .limit(olderCount + 1)
      .all()) as MessageRow[];
    const newer = (await this.prisma.orm.public.Message.where((f) =>
      and(f.roomId.eq(roomId), f.seq.gte(around), ...(floor === null ? [] : [f.seq.gte(floor)])),
    )
      .orderBy((f) => f.seq.asc())
      .limit(newerCount + 1)
      .all()) as MessageRow[];

    return {
      items: [...older.slice(0, olderCount).reverse(), ...newer.slice(0, newerCount)],
      hasMore: older.length > olderCount,
      hasMoreNewer: newer.length > newerCount,
    };
  }

  private async hasOlderThan(roomId: string, floor: bigint | null, seq: bigint): Promise<boolean> {
    const row = (await this.prisma.orm.public.Message.where((f) =>
      and(f.roomId.eq(roomId), f.seq.lt(seq), ...(floor === null ? [] : [f.seq.gte(floor)])),
    ).first()) as unknown;

    return row !== null;
  }

  async getMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<MessageView> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    const message = await this.findMessageOrThrow(roomId, messageId, actor.userId);
    const mentions = (await this.loadTargets(messageId)).map(toMentionTarget);
    const mentionsMe = await this.mentionsMeFor(actor.userId, [messageId]);
    const reactions = message.redactedAt ? new Map() : await this.reactionsForMany([messageId]);

    return toMessageView(
      message,
      mentions,
      mentionsMe.get(messageId) ?? null,
      reactions.get(messageId) ?? [],
    );
  }

  async pin(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<MessagePinView> {
    await this.permissions.assertCan(actor, roomId, 'room.pin');
    const message = await this.findMessageOrThrow(roomId, messageId, actor.userId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }

    const existing = (await this.prisma.orm.public.MessagePin.where({
      roomId,
      messageId,
    }).first()) as unknown;
    if (existing) {
      throw new MessageAlreadyPinnedError();
    }

    const row = await this.prisma.transaction(async (tx) => {
      const created = (await tx.orm.public.MessagePin.create({
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

      return created;
    });

    const [view] = await this.toViews(actor.userId, [message]);

    return { ...row, message: view as MessageView };
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
    await this.findMessageOrThrow(roomId, messageId, actor.userId);

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
    if (rows.length === 0) {
      return [];
    }

    const messages = (await this.prisma.orm.public.Message.where((f) =>
      f.id.in(rows.map((row) => row.messageId)),
    ).all()) as MessageRow[];
    const views = new Map(
      (await this.toViews(actor.userId, messages)).map((view) => [view.id, view]),
    );

    // A pin whose message is below the caller's floor (absent from `views`) is left out.
    const floor = await this.historyFloor.floorFor(roomId, actor.userId);
    const visible = new Set(
      messages.filter((m) => floor === null || m.seq >= floor).map((m) => m.id),
    );

    return rows.flatMap((row) => {
      const message = visible.has(row.messageId) ? views.get(row.messageId) : undefined;

      return message ? [{ ...row, message }] : [];
    });
  }

  /** Views of a set of messages: mentions, `mentionsMe` and reactions in one query each. */
  private async toViews(viewerId: string, rows: MessageRow[]): Promise<MessageView[]> {
    const ids = rows.map((row) => row.id);
    const mentionsByMessage = await this.targetsForMany(ids);
    const mentionsMe = await this.mentionsMeFor(viewerId, ids);
    const reactionsByMessage = await this.reactionsForMany(
      rows.filter((row) => !row.redactedAt).map((row) => row.id),
    );

    return rows.map((row) =>
      toMessageView(
        row,
        mentionsByMessage.get(row.id) ?? [],
        mentionsMe.get(row.id) ?? null,
        reactionsByMessage.get(row.id) ?? [],
      ),
    );
  }

  /** Rewrite the feed rows of the original event to the same tombstone as the room event row. */
  private async scrubFeedRows(
    tx: RoomTx,
    roomId: string,
    seq: bigint,
    reason: 'user' | 'retention',
  ): Promise<void> {
    const feedRows = (await tx.orm.public.AccountFeedEvent.where((f) =>
      and(f.roomId.eq(roomId), f.roomSeq.eq(seq)),
    ).all()) as Array<{ userId: string; feedSeq: bigint; payload: Record<string, unknown> }>;

    for (const row of feedRows) {
      await tx.orm.public.AccountFeedEvent.where({
        userId: row.userId,
        feedSeq: row.feedSeq,
      }).update({
        payload: { ...row.payload, type: 'message_redacted', content: { reason } },
      });
    }
  }

  private async findRoomOrThrow(
    id: string,
  ): Promise<{ id: string; type: string; readOnly: boolean }> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as {
      id: string;
      type: string;
      readOnly: boolean;
      deletedAt: string | null;
    } | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }

    return row;
  }

  /** The message, or `404` when unknown or below the viewer's history floor. */
  private async findMessageOrThrow(
    roomId: string,
    messageId: string,
    viewerId: string,
  ): Promise<MessageRow> {
    const row = (await this.prisma.orm.public.Message.where((f) =>
      and(f.id.eq(messageId), f.roomId.eq(roomId)),
    ).first()) as MessageRow | null;
    if (!row) {
      throw new MessageNotFoundError();
    }
    await this.historyFloor.assertVisible(roomId, viewerId, row.seq);

    return row;
  }

  /** A new message reopens a `dm` hidden by any participant; the history floors stay. */
  private async reopenHiddenMemberships(tx: RoomTx, roomId: string): Promise<void> {
    const hidden = (await tx.orm.public.Membership.where((f) =>
      and(f.roomId.eq(roomId), f.hiddenAt.isNotNull()),
    ).all()) as Array<{ userId: string }>;
    for (const { userId } of hidden) {
      await tx.orm.public.Membership.where({ roomId, userId }).update({ hiddenAt: null });
    }
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

  /** Insert targets and their recipients (at `seq`) inside the caller's transaction. */
  private async writeTargets(
    tx: RoomTx,
    messageId: string,
    roomId: string,
    seq: bigint,
    targets: ReadonlyArray<ResolvedMention & { position: number }>,
  ): Promise<void> {
    for (const target of targets) {
      await tx.orm.public.MessageMentionTarget.create({
        messageId,
        type: target.type,
        target: target.target,
        token: target.token,
        position: target.position,
      });
      if (target.audience.length > 0) {
        await tx.orm.public.MessageMentionRecipient.createAll(
          target.audience.map((userId) => ({
            messageId,
            type: target.type,
            target: target.target,
            userId,
            roomId,
            seq,
          })),
        );
      }
    }
  }

  private async loadTargets(messageId: string): Promise<MentionTargetRow[]> {
    const map = await this.targetRowsForMany([messageId]);

    return map.get(messageId) ?? [];
  }

  private async targetsForMany(messageIds: string[]): Promise<Map<string, MentionTarget[]>> {
    const rows = await this.targetRowsForMany(messageIds);

    return new Map([...rows].map(([id, list]) => [id, list.map(toMentionTarget)]));
  }

  /** Targets of each message, ordered by `position`. */
  private async targetRowsForMany(messageIds: string[]): Promise<Map<string, MentionTargetRow[]>> {
    const byMessage = new Map<string, MentionTargetRow[]>();
    if (messageIds.length === 0) {
      return byMessage;
    }

    const rows = (await this.prisma.orm.public.MessageMentionTarget.where((f) =>
      f.messageId.in(messageIds),
    )
      .orderBy((f) => f.position.asc())
      .all()) as MentionTargetRow[];
    for (const row of rows) {
      byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), row]);
    }

    return byMessage;
  }

  /**
   * Reactions of each message, grouped by emoji in order of first appearance
   * (`createdAt`, then `userId`). One query for the whole set.
   */
  private async reactionsForMany(messageIds: string[]): Promise<Map<string, MessageReaction[]>> {
    if (messageIds.length === 0) {
      return new Map();
    }

    const rows = (await this.prisma.orm.public.Reaction.where((f) =>
      f.messageId.in(messageIds),
    ).all()) as ReactionRow[];

    return groupReactions(rows);
  }

  /**
   * The caller's relation to each message: `direct` when one of their recipient
   * rows comes from a `user` target, else `collective` when they have any.
   * One recipient query for the whole page.
   */
  private async mentionsMeFor(
    userId: string,
    messageIds: string[],
  ): Promise<Map<string, MentionsMe>> {
    const result = new Map<string, MentionsMe>();
    if (messageIds.length === 0) {
      return result;
    }

    const rows = (await this.prisma.orm.public.MessageMentionRecipient.where((f) =>
      and(f.userId.eq(userId), f.messageId.in(messageIds)),
    ).all()) as Array<{ messageId: string; type: string }>;
    for (const row of rows) {
      if (row.type === 'user') {
        result.set(row.messageId, 'direct');
      } else if (!result.has(row.messageId)) {
        result.set(row.messageId, 'collective');
      }
    }

    return result;
  }
}
