import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError } from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { type RoomRow, type RoomView, toRoomView } from '../rooms/room.view.js';
import type { DirectoryListResponse, DirectoryQuery } from './directory.dto.js';

interface DirectoryCursor {
  name: string;
  id: string;
}

const CURSOR_FLOOR = '';

function encodeCursor(cursor: DirectoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(token: string): DirectoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Partial<DirectoryCursor>).name === 'string' &&
      typeof (parsed as Partial<DirectoryCursor>).id === 'string'
    ) {
      return parsed as DirectoryCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/** Wraps `q` for `ILIKE`, escaping its own wildcard characters. */
function likePrefix(q: string): string {
  return `${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

/**
 * Public directory: listing and search of public `channel` rooms, and
 * publish/unpublish (technical.md §8, issue #6).
 *
 * Search is PostgreSQL FTS (`to_tsvector('simple', name || ' ' || topic)`,
 * GIN-indexed) for queries of 3+ characters; shorter queries fall back to an
 * `ILIKE` name/topic prefix match — a `pg_trgm` extension was judged not
 * worth the added Postgres-extension dependency for this increment (a prefix
 * match already covers the "short prefix" case the trigram fallback targets).
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(query: DirectoryQuery): Promise<DirectoryListResponse> {
    const limit = this.config.get('rooms.directory_page_size');
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const hasCursor = cursor !== null;
    const q = query.query ?? '';
    const hasQuery = q.length > 0;
    const isShortQuery = hasQuery && q.length < 3;
    const likePattern = isShortQuery ? likePrefix(q) : '';

    const plan = this.prisma.raw.sql`
      SELECT id, type, parent_id AS "parentId", visibility, slug, name, topic,
             avatar_blob_id AS "avatarBlobId", default_role AS "defaultRole",
             read_only AS "readOnly", origin_server AS "originServer",
             last_seq AS "lastSeq", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM room
      WHERE type = 'channel' AND visibility = 'public' AND deleted_at IS NULL
        AND (${hasQuery} = false OR (
          (${isShortQuery} = true AND (name ILIKE ${likePattern} OR topic ILIKE ${likePattern}))
          OR (${isShortQuery} = false AND to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(topic, ''))
                @@ websearch_to_tsquery('simple', ${q}))
        ))
        AND (${hasCursor} = false OR (coalesce(name, ''), id) > (${cursor?.name ?? CURSOR_FLOOR}, ${cursor?.id ?? CURSOR_FLOOR}))
      ORDER BY name ASC, id ASC
      LIMIT ${limit + 1}
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
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as RoomRow[];
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toRoomView),
      nextCursor: hasNextPage && last ? encodeCursor({ name: last.name ?? '', id: last.id }) : null,
    };
  }

  async publish(actor: PermissionPrincipal, roomId: string): Promise<RoomView> {
    return this.setPublished(actor, roomId, true);
  }

  async unpublish(actor: PermissionPrincipal, roomId: string): Promise<RoomView> {
    return this.setPublished(actor, roomId, false);
  }

  private async setPublished(
    actor: PermissionPrincipal,
    roomId: string,
    published: boolean,
  ): Promise<RoomView> {
    await this.permissions.assertCan(actor, roomId, 'directory.publish');

    const nextVisibility = published ? 'public' : 'private';
    const now = new Date().toISOString();
    const updated = await this.prisma.transaction(async (tx) => {
      const room = (await tx.orm.public.Room.where({ id: roomId }).first()) as
        | (RoomRow & { deletedAt: string | null })
        | null;
      if (!room || room.deletedAt) {
        throw new RoomNotFoundError();
      }

      const row = (await tx.orm.public.Room.where({ id: roomId }).update({
        visibility: nextVisibility,
        updatedAt: now,
      })) as RoomRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'room_updated',
        senderId: actor.userId,
        content: { visibility: nextVisibility },
      });

      return row;
    });

    this.permissions.invalidateRoom(roomId);

    return toRoomView(updated);
  }
}
