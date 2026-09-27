import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, not, or } from '@prisma/orm-postgres/orm-client';
import { ulid } from 'ulid';
import { ConfigService } from '../../../core/config/config.service.js';
import { LinkPreviewUrlNotInBodyError } from '../../../core/link-previews/link-preview.errors.js';
import { LinkPreviewService } from '../../../core/link-previews/link-preview.service.js';
import {
  isEmptyPreview,
  type LinkPreviewView,
  type MessageLinkPreviewRow,
  toMessageLinkPreviewView,
} from '../../../core/link-previews/link-preview.view.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { Blob } from '../../../core/storage/blob.service.js';
import { BlobService } from '../../../core/storage/blob.service.js';
import { BlobReferenceRemoverRegistry } from '../../../core/storage/blob-reference-remover.registry.js';
import { FileAccessRegistry } from '../../../core/storage/file-access.registry.js';
import { UploadNotFoundError, UploadNotReadyError } from '../../../core/storage/storage.errors.js';
import type { UploadRecord } from '../../../core/storage/upload.service.js';
import { UploadService } from '../../../core/storage/upload.service.js';
import {
  AttachmentLimitExceededError,
  AttachmentNotFoundError,
  MessageAlreadyPinnedError,
  MessageBodyInvalidError,
  MessageBodyTooLongError,
  MessageEmptyError,
  MessageNotFoundError,
  MessageNotPinnedError,
  MessageReplyNotInRoomError,
  RoomNotFoundError,
  RoomPermissionDeniedError,
  RoomReadOnlyError,
} from '../conversations.errors.js';
import { EventLogService, type RoomTx } from '../events/event-log.service.js';
import { HistoryFloorService } from '../membership/history-floor.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import {
  type AttachmentRow,
  type AttachmentView,
  toAttachmentView,
  toRoomFileItem,
} from './attachment.view.js';
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
import type {
  EditMessage,
  FilesPage,
  ListFilesQuery,
  ListMessagesQuery,
  MessagePage,
  SendMessage,
} from './messages.dto.js';
import type { MessagePinRow, MessagePinView } from './pin.view.js';
import {
  extractHttpLinks,
  RestrictedMarkdownError,
  validateRestrictedMarkdown,
} from './restricted-markdown.js';

/** Default `limit` of `GET /rooms/:id/messages`, capped by `messages.max_page`. */
const DEFAULT_PAGE_SIZE = 50;
/** Default `limit` of `GET /rooms/:id/files`, capped the same way. */
const DEFAULT_FILES_PAGE_SIZE = 50;

interface Window {
  items: MessageRow[];
  hasMore: boolean;
  hasMoreNewer: boolean;
}

/** The fields written to `MessageLinkPreview` for a message (technical.md §S10). */
interface LinkPreviewSnapshot {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageBlobId: string | null;
}

function snapshotToView(snapshot: LinkPreviewSnapshot | null): LinkPreviewView | null {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.url,
    url: snapshot.url,
    title: snapshot.title,
    description: snapshot.description,
    siteName: snapshot.siteName,
    hasImage: snapshot.imageBlobId !== null,
  };
}

/**
 * Messages: send, restricted Markdown, mentions, replies, pins (technical.md
 * §11, issue #7), attachments (technical.md §S9, issue #143).
 */
@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly mentionResolver: MentionResolver,
    private readonly historyFloor: HistoryFloorService,
    private readonly uploads: UploadService,
    private readonly blobs: BlobService,
    private readonly fileAccess: FileAccessRegistry,
    private readonly linkPreviews: LinkPreviewService,
    private readonly blobReferenceRemovers: BlobReferenceRemoverRegistry,
  ) {}

  /**
   * Attachment access policy (technical.md §S6, §S9): `room.read` on the
   * attachment's room, the message not redacted, and — for a message hidden
   * by retention — `room.delete_any` too (same audience as moderation).
   */
  onModuleInit(): void {
    this.fileAccess.register('attachment', async (ref, userId) => {
      const attachment = (await this.prisma.orm.public.MessageAttachment.where({
        id: ref.id,
      }).first()) as AttachmentRow | null;
      if (!attachment) {
        return null;
      }

      const message = (await this.prisma.orm.public.Message.where({
        id: attachment.messageId,
      }).first()) as MessageRow | null;
      if (!message || message.redactedAt) {
        return null;
      }

      const user = (await this.prisma.orm.public.User.where({ id: userId }).first()) as {
        isOwner: boolean;
      } | null;
      const principal: PermissionPrincipal = { userId, isOwner: user?.isOwner ?? false };
      if (!(await this.permissions.can(principal, attachment.roomId, 'room.read'))) {
        return null;
      }
      if (
        message.hiddenAt &&
        !(await this.permissions.can(principal, attachment.roomId, 'room.delete_any'))
      ) {
        return null;
      }

      const blob = await this.blobs.findById(attachment.blobId);
      if (!blob) {
        return null;
      }

      if (ref.variant === 'thumbnail') {
        const thumbnail = blob.thumbnailBlobId
          ? await this.blobs.findById(blob.thumbnailBlobId)
          : null;
        if (thumbnail) {
          return {
            blob: thumbnail,
            filename: attachment.filename,
            contentType: thumbnail.contentType,
          };
        }
      }

      return { blob, filename: attachment.filename, contentType: attachment.contentType };
    });

    // `message_preview` access policy (technical.md §S6, §S10): same rule as `attachment`.
    this.fileAccess.register('message_preview', async (ref, userId) => {
      const preview = (await this.prisma.orm.public.MessageLinkPreview.where({
        messageId: ref.id,
      }).first()) as MessageLinkPreviewRow | null;
      if (!preview?.imageBlobId) {
        return null;
      }

      const message = (await this.prisma.orm.public.Message.where({
        id: preview.messageId,
      }).first()) as MessageRow | null;
      if (!message || message.redactedAt) {
        return null;
      }

      const user = (await this.prisma.orm.public.User.where({ id: userId }).first()) as {
        isOwner: boolean;
      } | null;
      const principal: PermissionPrincipal = { userId, isOwner: user?.isOwner ?? false };
      if (!(await this.permissions.can(principal, message.roomId, 'room.read'))) {
        return null;
      }
      if (
        message.hiddenAt &&
        !(await this.permissions.can(principal, message.roomId, 'room.delete_any'))
      ) {
        return null;
      }

      const blob = await this.blobs.findById(preview.imageBlobId);

      return blob ? { blob } : null;
    });

    // Force-removal everywhere (technical.md §S11, issue #146): every
    // attachment referencing `blobId` is deleted, its room notified, and the
    // reference released.
    this.blobReferenceRemovers.register(async (blobId) => {
      const attachments = (await this.prisma.orm.public.MessageAttachment.where({
        blobId,
      }).all()) as AttachmentRow[];

      for (const attachment of attachments) {
        await this.prisma.transaction(async (tx) => {
          await tx.orm.public.MessageAttachment.where({ id: attachment.id }).delete();
          await this.blobs.release(blobId, tx.orm);
          await this.eventLog.append(tx, {
            roomId: attachment.roomId,
            type: 'attachment_removed',
            senderId: null,
            content: { messageId: attachment.messageId, attachmentId: attachment.id },
          });
        });
      }
    });

    // Force-removal everywhere: every message's link-preview snapshot
    // referencing `blobId` as its image loses that image.
    this.blobReferenceRemovers.register(async (blobId) => {
      const previews = (await this.prisma.orm.public.MessageLinkPreview.where({
        imageBlobId: blobId,
      }).all()) as MessageLinkPreviewRow[];

      for (const preview of previews) {
        await this.prisma.transaction(async (tx) => {
          await tx.orm.public.MessageLinkPreview.where({
            messageId: preview.messageId,
          }).update({ imageBlobId: null });
          await this.blobs.release(blobId, tx.orm);
        });
      }
    });
  }

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

    if (input.body === undefined && (input.attachments?.length ?? 0) === 0) {
      throw new MessageEmptyError();
    }
    if (input.body !== undefined) {
      this.validateBody(input.body);
    }
    if (input.attachments && input.attachments.length > 0) {
      await this.permissions.assertCan(actor, roomId, 'room.attach');
    }
    const maxAttachments = this.config.get('attachments.max_per_message');
    if ((input.attachments?.length ?? 0) > maxAttachments) {
      throw new AttachmentLimitExceededError();
    }
    const resolvedUploads = await this.resolveAttachmentUploads(
      actor.userId,
      input.attachments ?? [],
    );
    const linkPreviewSnapshot = input.linkPreviewUrl
      ? await this.resolveLinkPreviewSnapshot(input.linkPreviewUrl, input.body ?? '')
      : null;

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
    const attachmentIds = resolvedUploads.map(() => ulid());
    const attachmentTargets = resolvedUploads.map(({ upload, blob }, position) => ({
      id: attachmentIds[position] as string,
      filename: upload.filename,
      contentType: blob.contentType,
      sizeBytes: blob.sizeBytes.toString(),
      position,
    }));

    const id = ulid();
    const message = await this.prisma.transaction(async (tx) => {
      const event = await this.eventLog.append(tx, {
        roomId,
        type: 'message_created',
        senderId: actor.userId,
        content: {
          messageId: id,
          body: input.body ?? '',
          replyToId: input.replyToId ?? null,
          mentions: targets.map(toMentionTarget),
          attachments: attachmentTargets,
          linkPreview: snapshotToView(linkPreviewSnapshot),
        },
      });

      const row = (await tx.orm.public.Message.create({
        id,
        roomId,
        seq: event.seq,
        authorId: actor.userId,
        body: input.body ?? '',
        replyToId: input.replyToId ?? null,
        editedAt: null,
        redactedAt: null,
        redactedById: null,
        hiddenAt: null,
      })) as MessageRow;

      await this.writeTargets(tx, id, roomId, event.seq, targets);
      await this.createAttachments(tx, id, roomId, actor.userId, resolvedUploads, attachmentIds);
      if (linkPreviewSnapshot) {
        await tx.orm.public.MessageLinkPreview.create({ messageId: id, ...linkPreviewSnapshot });
        if (linkPreviewSnapshot.imageBlobId) {
          await this.blobs.retain(linkPreviewSnapshot.imageBlobId, tx.orm);
        }
      }
      if (room.type === 'dm') {
        await this.reopenHiddenMemberships(tx, roomId);
      }

      return row;
    });

    const attachmentViews = resolvedUploads.map(({ blob }, position) =>
      toAttachmentView(
        {
          id: attachmentIds[position] as string,
          messageId: id,
          roomId,
          blobId: blob.id,
          filename: attachmentTargets[position]?.filename as string,
          contentType: blob.contentType,
          sizeBytes: blob.sizeBytes,
          position,
          uploaderId: actor.userId,
          createdAt: message.createdAt,
        },
        blob,
      ),
    );

    return toMessageView(
      message,
      targets.map(toMentionTarget),
      null,
      [],
      attachmentViews,
      snapshotToView(linkPreviewSnapshot),
    );
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
    if (input.body !== undefined) {
      this.validateBody(input.body);
    }

    const existingAttachments = (await this.prisma.orm.public.MessageAttachment.where({
      messageId,
    }).all()) as AttachmentRow[];
    const addIds = input.attachments?.add ?? [];
    const removeIds = input.attachments?.remove ?? [];
    if (removeIds.length > 0) {
      const existingIds = new Set(existingAttachments.map((row) => row.id));
      if (!removeIds.every((id) => existingIds.has(id))) {
        throw new AttachmentNotFoundError();
      }
    }
    if (addIds.length > 0) {
      await this.assertCanAttachOrThrow(actor, roomId, message);
    }
    const finalAttachmentCount = existingAttachments.length - removeIds.length + addIds.length;
    const maxAttachments = this.config.get('attachments.max_per_message');
    if (finalAttachmentCount > maxAttachments) {
      throw new AttachmentLimitExceededError();
    }
    const finalBody = input.body ?? message.body;
    if (finalBody === '' && finalAttachmentCount === 0) {
      throw new MessageEmptyError();
    }

    const existingPreview = (await this.prisma.orm.public.MessageLinkPreview.where({
      messageId,
    }).first()) as MessageLinkPreviewRow | null;
    // `undefined`: input omitted `linkPreviewUrl`, keep `existingPreview` as is.
    let linkPreviewChange: LinkPreviewSnapshot | null | undefined;
    if (input.linkPreviewUrl === null) {
      linkPreviewChange = null;
    } else if (input.linkPreviewUrl !== undefined) {
      linkPreviewChange = await this.resolveLinkPreviewSnapshot(input.linkPreviewUrl, finalBody);
    }

    const resolvedUploads = await this.resolveAttachmentUploads(actor.userId, addIds);
    const newAttachmentIds = resolvedUploads.map(() => ulid());
    const firstAttachmentPosition =
      Math.max(-1, ...existingAttachments.map((row) => row.position)) + 1;

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
        body: finalBody,
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

      for (const attachmentId of removeIds) {
        const attachment = existingAttachments.find((row) => row.id === attachmentId);
        await tx.orm.public.MessageAttachment.where({ id: attachmentId }).delete();
        if (attachment) {
          await this.blobs.release(attachment.blobId, tx.orm);
        }
      }
      await this.createAttachments(
        tx,
        messageId,
        roomId,
        actor.userId,
        resolvedUploads,
        newAttachmentIds,
        firstAttachmentPosition,
      );

      if (linkPreviewChange !== undefined) {
        if (existingPreview) {
          await tx.orm.public.MessageLinkPreview.where({ messageId }).delete();
          if (existingPreview.imageBlobId) {
            await this.blobs.release(existingPreview.imageBlobId, tx.orm);
          }
        }
        if (linkPreviewChange) {
          await tx.orm.public.MessageLinkPreview.create({ messageId, ...linkPreviewChange });
          if (linkPreviewChange.imageBlobId) {
            await this.blobs.retain(linkPreviewChange.imageBlobId, tx.orm);
          }
        }
      }

      return row;
    });

    const targets = await this.loadTargets(messageId);
    const mentionsMe = await this.mentionsMeFor(actor.userId, [messageId]);
    const reactions = await this.reactionsForMany([messageId]);
    const attachments = await this.attachmentsForMany([messageId]);
    const finalPreview: LinkPreviewSnapshot | null =
      linkPreviewChange !== undefined ? linkPreviewChange : existingPreview;

    return toMessageView(
      updated,
      targets.map(toMentionTarget),
      mentionsMe.get(messageId) ?? null,
      reactions.get(messageId) ?? [],
      attachments.get(messageId) ?? [],
      snapshotToView(finalPreview),
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
   * Remove one attachment (technical.md §S9, issue #143). `room.delete_own`
   * (the author) or `room.delete_any` — same rule and same
   * `{ authorId, viaCapability }` return shape as {@link deleteMessage}, so
   * the moderation façade knows whether to audit it.
   */
  async removeAttachment(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ authorId: string | null; viaCapability: 'delete_own' | 'delete_any' }> {
    const message = await this.findMessageOrThrow(roomId, messageId, actor.userId);
    if (message.redactedAt) {
      throw new MessageNotFoundError();
    }
    const attachment = (await this.prisma.orm.public.MessageAttachment.where({
      id: attachmentId,
      messageId,
    }).first()) as AttachmentRow | null;
    if (!attachment) {
      throw new AttachmentNotFoundError();
    }

    const isAuthor = message.authorId === actor.userId;
    const canDeleteOwn = isAuthor && (await this.permissions.can(actor, roomId, 'room.delete_own'));
    const viaCapability = canDeleteOwn ? 'delete_own' : 'delete_any';
    if (!canDeleteOwn) {
      await this.permissions.assertCan(actor, roomId, 'room.delete_any');
    }

    const { count: otherAttachmentsCount } = await this.prisma.orm.public.MessageAttachment.where(
      (f) => and(f.messageId.eq(messageId), f.id.neq(attachmentId)),
    ).aggregate((a) => ({ count: a.count() }));
    const linkPreview = (await this.prisma.orm.public.MessageLinkPreview.where({
      messageId,
    }).first()) as MessageLinkPreviewRow | null;

    if (otherAttachmentsCount === 0 && message.body === '' && !linkPreview) {
      // Removing the last attachment leaves nothing to show — redact the
      // message so it renders as "deleted" instead of an empty bubble.
      await this.redactMessage(roomId, message, actor.userId, 'user');

      return { authorId: message.authorId, viaCapability };
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.MessageAttachment.where({ id: attachmentId }).delete();
      await this.blobs.release(attachment.blobId, tx.orm);
      await this.eventLog.append(tx, {
        roomId,
        type: 'attachment_removed',
        senderId: actor.userId,
        content: { messageId, attachmentId },
      });
    });

    return { authorId: message.authorId, viaCapability };
  }

  /**
   * The room's attachments, newest first (technical.md §S9, issue #143).
   * `media` is `image/*`, `video/*`, `audio/*`; `documents` is everything
   * else. Hidden and redacted messages are excluded.
   */
  async listFiles(
    actor: PermissionPrincipal,
    roomId: string,
    query: ListFilesQuery,
  ): Promise<FilesPage> {
    await this.permissions.assertCan(actor, roomId, 'room.read');
    await this.findRoomOrThrow(roomId);

    const maxPage = this.config.get('messages.max_page');
    const limit = Math.min(query.limit ?? DEFAULT_FILES_PAGE_SIZE, maxPage);

    let beforeCreatedAt: string | null = null;
    if (query.before !== undefined) {
      const cursor = (await this.prisma.orm.public.MessageAttachment.where({
        id: query.before,
        roomId,
      }).first()) as AttachmentRow | null;
      if (!cursor) {
        return { items: [], nextCursor: null };
      }
      beforeCreatedAt = cursor.createdAt;
    }

    const visibleMessageIds = (
      (await this.prisma.orm.public.Message.where((f) =>
        and(f.roomId.eq(roomId), f.hiddenAt.isNull(), f.redactedAt.isNull()),
      ).all()) as MessageRow[]
    ).map((row) => row.id);
    if (visibleMessageIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const rows = (await this.prisma.orm.public.MessageAttachment.where((f) =>
      and(
        f.roomId.eq(roomId),
        f.messageId.in(visibleMessageIds),
        ...(beforeCreatedAt === null ? [] : [f.createdAt.lt(beforeCreatedAt)]),
        ...(query.kind === undefined
          ? []
          : [
              query.kind === 'media'
                ? or(
                    f.contentType.like('image/%'),
                    f.contentType.like('video/%'),
                    f.contentType.like('audio/%'),
                  )
                : not(
                    or(
                      f.contentType.like('image/%'),
                      f.contentType.like('video/%'),
                      f.contentType.like('audio/%'),
                    ),
                  ),
            ]),
      ),
    )
      .orderBy((f) => f.createdAt.desc())
      .limit(limit + 1)
      .all()) as AttachmentRow[];

    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const blobIds = [...new Set(items.map((row) => row.blobId))];
    const blobRows = (await this.prisma.orm.public.Blob.where((f) =>
      f.id.in(blobIds),
    ).all()) as Blob[];
    const blobsById = new Map(blobRows.map((blob) => [blob.id, blob] as const));

    return {
      items: items.map((row) => toRoomFileItem(row, blobsById.get(row.blobId) ?? null)),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
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
      const attachments = (await tx.orm.public.MessageAttachment.where({
        messageId: message.id,
      }).all()) as AttachmentRow[];
      for (const attachment of attachments) {
        await tx.orm.public.MessageAttachment.where({ id: attachment.id }).delete();
        await this.blobs.release(attachment.blobId, tx.orm);
      }
      const preview = (await tx.orm.public.MessageLinkPreview.where({
        messageId: message.id,
      }).first()) as MessageLinkPreviewRow | null;
      if (preview) {
        await tx.orm.public.MessageLinkPreview.where({ messageId: message.id }).delete();
        if (preview.imageBlobId) {
          await this.blobs.release(preview.imageBlobId, tx.orm);
        }
      }
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
    const attachmentsByMessage = await this.attachmentsForMany(ids);
    const linkPreviewsByMessage = await this.linkPreviewsForMany(ids);

    return {
      items: window.items.map((row) =>
        toMessageView(
          row,
          mentionsByMessage.get(row.id) ?? [],
          mentionsMe.get(row.id) ?? null,
          reactionsByMessage.get(row.id) ?? [],
          attachmentsByMessage.get(row.id) ?? [],
          linkPreviewsByMessage.get(row.id) ?? null,
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
    const attachments = message.redactedAt ? new Map() : await this.attachmentsForMany([messageId]);
    const linkPreviews = message.redactedAt
      ? new Map()
      : await this.linkPreviewsForMany([messageId]);

    return toMessageView(
      message,
      mentions,
      mentionsMe.get(messageId) ?? null,
      reactions.get(messageId) ?? [],
      attachments.get(messageId) ?? [],
      linkPreviews.get(messageId) ?? null,
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
    const attachmentsByMessage = await this.attachmentsForMany(
      rows.filter((row) => !row.redactedAt).map((row) => row.id),
    );
    const linkPreviewsByMessage = await this.linkPreviewsForMany(
      rows.filter((row) => !row.redactedAt).map((row) => row.id),
    );

    return rows.map((row) =>
      toMessageView(
        row,
        mentionsByMessage.get(row.id) ?? [],
        mentionsMe.get(row.id) ?? null,
        reactionsByMessage.get(row.id) ?? [],
        attachmentsByMessage.get(row.id) ?? [],
        linkPreviewsByMessage.get(row.id) ?? null,
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

  /**
   * Adding attachments on edit is author-only, within `messages.edit_window`
   * (technical.md §S9): quota and files belong to the author, so `room.edit_any`
   * does not extend to attaching new files on someone else's message.
   */
  private async assertCanAttachOrThrow(
    actor: PermissionPrincipal,
    roomId: string,
    message: MessageRow,
  ): Promise<void> {
    const editWindow = this.config.get('messages.edit_window');
    const withinWindow =
      editWindow === null ||
      Date.now() <= new Date(message.createdAt).getTime() + editWindow * 1000;
    if (message.authorId !== actor.userId || !withinWindow) {
      throw new RoomPermissionDeniedError(
        'Only the author can add attachments, within the edit window.',
      );
    }
    await this.permissions.assertCan(actor, roomId, 'room.attach');
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

  /**
   * Resolve `uploadIds` to their upload + blob, in the given order (technical.md
   * §S9): each must belong to `userId`, be `ready` and not expired.
   */
  private async resolveAttachmentUploads(
    userId: string,
    uploadIds: readonly string[],
  ): Promise<Array<{ upload: UploadRecord; blob: Blob }>> {
    const resolved: Array<{ upload: UploadRecord; blob: Blob }> = [];
    for (const uploadId of uploadIds) {
      const upload = await this.uploads.findOwned(uploadId, userId);
      if (!upload) {
        throw new UploadNotFoundError();
      }
      this.uploads.assertNotExpired(upload);
      if (upload.state !== 'ready' || !upload.blobId) {
        throw new UploadNotReadyError();
      }
      const blob = await this.blobs.findById(upload.blobId);
      if (!blob) {
        throw new UploadNotReadyError();
      }
      resolved.push({ upload, blob });
    }

    return resolved;
  }

  /**
   * Resolve `linkPreviewUrl` to a snapshot to write into `MessageLinkPreview`
   * (technical.md §S10): the URL must be one of the `http(s)` links in the
   * body; disabled or nothing-to-preview both resolve to `null` (ignored),
   * not an error.
   */
  private async resolveLinkPreviewSnapshot(
    url: string,
    body: string,
  ): Promise<LinkPreviewSnapshot | null> {
    if (!this.config.get('link_previews.enabled')) {
      return null;
    }
    if (!extractHttpLinks(body).includes(url)) {
      throw new LinkPreviewUrlNotInBodyError();
    }

    const row = await this.linkPreviews.resolve(url);
    if (isEmptyPreview(row)) {
      return null;
    }

    return {
      url: row.url,
      title: row.title,
      description: row.description,
      siteName: row.siteName,
      imageBlobId: row.imageBlobId,
    };
  }

  /** Create the `MessageAttachment` rows and consume the uploads (no net retain/release: the blob reference moves). */
  private async createAttachments(
    tx: RoomTx,
    messageId: string,
    roomId: string,
    uploaderId: string,
    resolvedUploads: ReadonlyArray<{ upload: UploadRecord; blob: Blob }>,
    attachmentIds: readonly string[],
    startPosition = 0,
  ): Promise<void> {
    for (const [i, { upload, blob }] of resolvedUploads.entries()) {
      await tx.orm.public.MessageAttachment.create({
        id: attachmentIds[i] as string,
        messageId,
        roomId,
        blobId: blob.id,
        filename: upload.filename,
        contentType: blob.contentType,
        sizeBytes: blob.sizeBytes,
        position: startPosition + i,
        uploaderId,
      });
      await tx.orm.public.Upload.where({ id: upload.id }).delete();
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

  /** Attachments of each message, ordered by `position`, blob metadata joined in one extra query. */
  private async attachmentsForMany(messageIds: string[]): Promise<Map<string, AttachmentView[]>> {
    const byMessage = new Map<string, AttachmentView[]>();
    if (messageIds.length === 0) {
      return byMessage;
    }

    const rows = (await this.prisma.orm.public.MessageAttachment.where((f) =>
      f.messageId.in(messageIds),
    )
      .orderBy((f) => f.position.asc())
      .all()) as AttachmentRow[];
    if (rows.length === 0) {
      return byMessage;
    }

    const blobIds = [...new Set(rows.map((row) => row.blobId))];
    const blobRows = (await this.prisma.orm.public.Blob.where((f) =>
      f.id.in(blobIds),
    ).all()) as Blob[];
    const blobsById = new Map(blobRows.map((blob) => [blob.id, blob] as const));

    for (const row of rows) {
      const view = toAttachmentView(row, blobsById.get(row.blobId) ?? null);
      byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), view]);
    }

    return byMessage;
  }

  /** Each message's `linkPreview`, one query for the whole set (technical.md §S10). */
  private async linkPreviewsForMany(messageIds: string[]): Promise<Map<string, LinkPreviewView>> {
    const byMessage = new Map<string, LinkPreviewView>();
    if (messageIds.length === 0) {
      return byMessage;
    }

    const rows = (await this.prisma.orm.public.MessageLinkPreview.where((f) =>
      f.messageId.in(messageIds),
    ).all()) as MessageLinkPreviewRow[];
    for (const row of rows) {
      byMessage.set(row.messageId, toMessageLinkPreviewView(row));
    }

    return byMessage;
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
