import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserSummaryReader } from '../users/user-summary.reader.js';
import type {
  AdminAttachmentItem,
  AdminAttachmentsPage,
  AdminAttachmentsQuery,
  AdminStorageDashboard,
  AdminUserStorageView,
} from './admin-storage.dto.js';
import { StorageBlobNotFoundError, StorageUserNotFoundError } from './admin-storage.errors.js';
import { BlobService } from './blob.service.js';
import { BlobReferenceRemoverRegistry } from './blob-reference-remover.registry.js';
import { MediaToolsService } from './media-tools.service.js';
import { StorageQuotaService } from './storage-quota.service.js';

/** Wraps `q` for `ILIKE`, escaping its own wildcard characters. */
function likePattern(q: string): string {
  return `%${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

const DEFAULT_PAGE_SIZE = 50;
const TOP_CONSUMERS_LIMIT = 10;
const CURSOR_EPOCH = '1970-01-01T00:00:00.000Z';

interface TopConsumerRow {
  userId: string;
  usedBytes: bigint;
}

interface AttachmentSearchRow {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  createdAt: string;
  messageId: string;
  roomId: string;
  roomName: string | null;
  uploaderId: string;
}

/**
 * Admin storage: per-user quota overrides, the global dashboard, attachment
 * search and cross-feature blob removal (technical.md §S11, issue #146).
 */
@Injectable()
export class AdminStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly quotas: StorageQuotaService,
    private readonly blobs: BlobService,
    private readonly mediaTools: MediaToolsService,
    private readonly userSummaries: UserSummaryReader,
    private readonly removers: BlobReferenceRemoverRegistry,
    private readonly audit: AuditService,
  ) {}

  async getUserStorage(userId: string): Promise<AdminUserStorageView> {
    await this.assertUserExists(userId);

    const [{ usedBytes, pendingBytes, quotaBytes }, override] = await Promise.all([
      this.quotas.storageOf(userId),
      this.prisma.orm.public.StorageQuotaOverride.where({ userId }).first() as Promise<{
        quotaBytes: bigint | null;
      } | null>,
    ]);

    return {
      usedBytes: usedBytes.toString(),
      pendingBytes: pendingBytes.toString(),
      quotaBytes: quotaBytes?.toString() ?? null,
      overridden: override !== null,
    };
  }

  async setUserQuota(userId: string, quotaBytes: bigint | null, actorId: string): Promise<void> {
    await this.assertUserExists(userId);

    const before = (await this.prisma.orm.public.StorageQuotaOverride.where({
      userId,
    }).first()) as { quotaBytes: bigint | null } | null;

    if (before) {
      await this.prisma.orm.public.StorageQuotaOverride.where({ userId }).update({ quotaBytes });
    } else {
      await this.prisma.orm.public.StorageQuotaOverride.create({ userId, quotaBytes });
    }

    await this.audit.record({
      action: 'storage.user_quota_changed',
      actorUserId: actorId,
      targetType: 'user',
      targetId: userId,
      metadata: {
        oldValue: before ? (before.quotaBytes?.toString() ?? null) : 'default',
        newValue: quotaBytes?.toString() ?? null,
      },
    });
  }

  async resetUserQuota(userId: string, actorId: string): Promise<void> {
    await this.assertUserExists(userId);

    const before = (await this.prisma.orm.public.StorageQuotaOverride.where({
      userId,
    }).first()) as { quotaBytes: bigint | null } | null;
    if (!before) {
      return;
    }

    await this.prisma.orm.public.StorageQuotaOverride.where({ userId }).delete();

    await this.audit.record({
      action: 'storage.user_quota_changed',
      actorUserId: actorId,
      targetType: 'user',
      targetId: userId,
      metadata: { oldValue: before.quotaBytes?.toString() ?? null, newValue: null },
    });
  }

  async dashboard(): Promise<AdminStorageDashboard> {
    const [usedBytes, blobAgg, pendingAgg, topConsumerRows] = await Promise.all([
      this.quotas.globalUsage(),
      this.prisma.orm.public.Blob.aggregate((a) => ({ count: a.count() })),
      this.prisma.orm.public.Upload.where((u) => u.state.eq('receiving')).aggregate((a) => ({
        count: a.count(),
      })),
      this.topConsumerRows(),
    ]);

    const summaries = await this.userSummaries.readMany(topConsumerRows.map((r) => r.userId));
    const topConsumers = topConsumerRows.map((row) => ({
      user: summaries.get(row.userId) ?? {
        id: row.userId,
        identifier: null,
        displayName: null,
        avatarUrl: null,
      },
      usedBytes: row.usedBytes.toString(),
    }));

    const capacityBytes = this.config.get('storage.capacity_bytes');

    return {
      usedBytes: usedBytes.toString(),
      capacityBytes: capacityBytes === null ? null : String(capacityBytes),
      blobCount: blobAgg.count,
      pendingUploads: pendingAgg.count,
      topConsumers,
      driver: this.config.get('storage.driver'),
      mediaTools: {
        available: this.mediaTools.available,
        ffmpegVersion: this.mediaTools.ffmpegVersion,
      },
    };
  }

  private async topConsumerRows(): Promise<TopConsumerRow[]> {
    const plan = this.prisma.raw.sql`
      SELECT uploader_id AS "userId", sum(size_bytes) AS "usedBytes"
      FROM blob
      WHERE uploader_id IS NOT NULL AND ref_count > 0
      GROUP BY uploader_id
      ORDER BY sum(size_bytes) DESC
      LIMIT ${TOP_CONSUMERS_LIMIT}
    `
      .returnsRow({
        userId: { codecId: 'pg/text@1', nullable: false },
        usedBytes: { codecId: 'pg/int8@1', nullable: false },
      })
      .build();

    return (await this.prisma.runtime().query(plan)) as TopConsumerRow[];
  }

  async searchAttachments(query: AdminAttachmentsQuery): Promise<AdminAttachmentsPage> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const qPattern = likePattern(query.q ?? '');
    const hasQ = query.q !== undefined && query.q.length > 0;
    const hasUploader = query.uploaderId !== undefined;
    const hasRoom = query.roomId !== undefined;
    const hasType = query.type !== undefined;
    const isMedia = query.type === 'media';

    let beforeCreatedAt: string | null = null;
    if (query.before !== undefined) {
      const cursor = (await this.prisma.orm.public.MessageAttachment.where({
        id: query.before,
      }).first()) as { createdAt: string } | null;
      if (!cursor) {
        return { items: [], nextCursor: null };
      }
      beforeCreatedAt = cursor.createdAt;
    }
    const hasCursor = beforeCreatedAt !== null;

    const plan = this.prisma.raw.sql`
      SELECT a.id AS id, a.filename AS filename, a.content_type AS "contentType",
             a.size_bytes AS "sizeBytes", a.created_at AS "createdAt",
             a.message_id AS "messageId", a.room_id AS "roomId", r.name AS "roomName",
             a.uploader_id AS "uploaderId"
      FROM message_attachment a
      LEFT JOIN room r ON r.id = a.room_id
      WHERE (${hasQ} = false OR a.filename ILIKE ${qPattern})
        AND (${hasUploader} = false OR a.uploader_id = ${query.uploaderId ?? ''})
        AND (${hasRoom} = false OR a.room_id = ${query.roomId ?? ''})
        AND (
          ${hasType} = false
          OR (${isMedia} = true AND (a.content_type LIKE 'image/%' OR a.content_type LIKE 'video/%' OR a.content_type LIKE 'audio/%'))
          OR (${isMedia} = false AND NOT (a.content_type LIKE 'image/%' OR a.content_type LIKE 'video/%' OR a.content_type LIKE 'audio/%'))
        )
        AND (${hasCursor} = false OR a.created_at < ${beforeCreatedAt ?? CURSOR_EPOCH})
      ORDER BY a.created_at DESC
      LIMIT ${limit + 1}
    `
      .returnsRow({
        id: { codecId: 'pg/text@1', nullable: false },
        filename: { codecId: 'pg/text@1', nullable: false },
        contentType: { codecId: 'pg/text@1', nullable: false },
        sizeBytes: { codecId: 'pg/int8@1', nullable: false },
        createdAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
        messageId: { codecId: 'pg/text@1', nullable: false },
        roomId: { codecId: 'pg/text@1', nullable: false },
        roomName: { codecId: 'pg/text@1', nullable: true },
        uploaderId: { codecId: 'pg/text@1', nullable: false },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as AttachmentSearchRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const summaries = await this.userSummaries.readMany(page.map((row) => row.uploaderId));
    const items: AdminAttachmentItem[] = page.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes.toString(),
      createdAt: row.createdAt,
      room: { id: row.roomId, name: row.roomName },
      message: { id: row.messageId },
      uploader: summaries.get(row.uploaderId) ?? {
        id: row.uploaderId,
        identifier: null,
        displayName: null,
        avatarUrl: null,
      },
    }));

    return { items, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
  }

  async removeBlobEverywhere(blobId: string, actorId: string): Promise<void> {
    const blob = await this.blobs.findById(blobId);
    if (!blob) {
      throw new StorageBlobNotFoundError();
    }

    await this.removers.removeEverywhere(blobId);

    await this.audit.record({
      action: 'storage.content_removed',
      actorUserId: actorId,
      targetType: 'blob',
      targetId: blobId,
      metadata: { hash: blob.hash },
    });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = (await this.prisma.orm.public.User.where({ id: userId }).first()) as {
      status: string;
    } | null;
    if (!user || user.status === 'deleted') {
      throw new StorageUserNotFoundError();
    }
  }
}
