import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { type MentionTargetRow, toMentionTarget } from '../messages/mention.types.js';
import {
  groupReactions,
  type MessageRow,
  type ReactionRow,
  toMessageView,
} from '../messages/message.view.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { ListMyMentionsQuery } from './mentions.dto.js';
import type {
  MyMention,
  MyMentionsPage,
  UnreadMentions,
  UnreadMentionsView,
} from './mentions.view.js';

const LIST_DEFAULT_LIMIT = 30;
const LIST_MAX_LIMIT = 100;

interface MentionCursor {
  at: string;
  messageId: string;
}

/** Opaque `GET /me/mentions` cursor: the last `(at, messageId)` of the previous page. */
function encodeCursor(cursor: MentionCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(token: string): MentionCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Partial<MentionCursor>).at === 'string' &&
      !Number.isNaN(Date.parse((parsed as MentionCursor).at)) &&
      typeof (parsed as Partial<MentionCursor>).messageId === 'string'
    ) {
      return parsed as MentionCursor;
    }
    return null;
  } catch {
    return null;
  }
}

const CURSOR_FLOOR = '1970-01-01T00:00:00.000000Z';

interface MentionRow {
  messageId: string;
  roomId: string;
  direct: boolean;
  unread: boolean;
  at: string;
}

/**
 * Unread mention counters and "My mentions" (web-client-mentions technical.md S5).
 * Both read the recipient rows frozen when a target was created, so they never
 * depend on the room's membership today; they only drop redacted and hidden
 * messages, deleted rooms and rooms the caller can no longer read.
 */
@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Distinct unread messages per room: `direct` when any of their rows comes from a `user` target. */
  async unread(actor: PermissionPrincipal): Promise<UnreadMentionsView> {
    const plan = this.prisma.raw.sql`
      SELECT room_id AS "roomId",
             count(*) FILTER (WHERE direct)::int AS "direct",
             count(*) FILTER (WHERE NOT direct)::int AS "collective"
      FROM (
        SELECT r.room_id, r.message_id, bool_or(r.type = 'user') AS direct
        FROM message_mention_recipient r
        JOIN message m ON m.id = r.message_id
        JOIN room ro ON ro.id = r.room_id AND ro.deleted_at IS NULL
        LEFT JOIN read_marker rm ON rm.room_id = r.room_id AND rm.user_id = r.user_id
        WHERE r.user_id = ${actor.userId}
          AND r.seq > coalesce(rm.seq, 0)
          AND m.redacted_at IS NULL AND m.hidden_at IS NULL
        GROUP BY r.room_id, r.message_id
      ) unread_messages
      GROUP BY room_id
      ORDER BY room_id ASC
    `
      .returnsRow({
        roomId: { codecId: 'pg/text@1', nullable: false },
        direct: { codecId: 'pg/int4@1', nullable: false },
        collective: { codecId: 'pg/int4@1', nullable: false },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as UnreadMentions[];
    const items: UnreadMentions[] = [];
    for (const row of rows) {
      if (await this.permissions.can(actor, row.roomId, 'room.read')) {
        items.push(row);
      }
    }

    return { items };
  }

  /**
   * The messages that concern the caller, most recent mention first (a mention
   * added by an edit counts from the edit). Read items stay, with
   * `unread: false`. Rooms the caller can no longer read are skipped, so a page
   * is refilled from the following rows until it holds `limit` items.
   */
  async list(actor: PermissionPrincipal, query: ListMyMentionsQuery): Promise<MyMentionsPage> {
    const limit = Math.min(query.limit ?? LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
    let cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const kept: MentionRow[] = [];
    let exhausted = false;
    let lastConsumed: MentionRow | null = null;
    while (kept.length <= limit && !exhausted) {
      const batch = await this.fetchBatch(actor.userId, cursor, limit + 1);
      exhausted = batch.length <= limit;
      for (const row of batch.slice(0, limit + 1)) {
        lastConsumed = row;
        if (await this.permissions.can(actor, row.roomId, 'room.read')) {
          kept.push(row);
        }
        if (kept.length > limit) {
          break;
        }
      }
      cursor = lastConsumed ? { at: lastConsumed.at, messageId: lastConsumed.messageId } : cursor;
    }

    const page = kept.slice(0, limit);
    const last = page.at(-1);
    const hasNextPage = kept.length > limit;

    return {
      items: await this.toItems(page),
      nextCursor:
        hasNextPage && last ? encodeCursor({ at: last.at, messageId: last.messageId }) : null,
    };
  }

  private async fetchBatch(
    userId: string,
    cursor: MentionCursor | null,
    size: number,
  ): Promise<MentionRow[]> {
    const hasCursor = cursor !== null;
    const plan = this.prisma.raw.sql`
      SELECT r.message_id AS "messageId", r.room_id AS "roomId",
             bool_or(r.type = 'user') AS "direct",
             bool_or(r.seq > coalesce(rm.seq, 0)) AS "unread",
             to_char(max(e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "at"
      FROM message_mention_recipient r
      JOIN message m ON m.id = r.message_id
      JOIN room ro ON ro.id = r.room_id AND ro.deleted_at IS NULL
      JOIN room_event e ON e.room_id = r.room_id AND e.seq = r.seq
      LEFT JOIN read_marker rm ON rm.room_id = r.room_id AND rm.user_id = r.user_id
      WHERE r.user_id = ${userId}
        AND m.redacted_at IS NULL AND m.hidden_at IS NULL
      GROUP BY r.message_id, r.room_id
      HAVING ${hasCursor} = false
        OR (max(e.created_at), r.message_id) < (${cursor?.at ?? CURSOR_FLOOR}::timestamptz, ${cursor?.messageId ?? ''})
      ORDER BY max(e.created_at) DESC, r.message_id DESC
      LIMIT ${size}
    `
      .returnsRow({
        messageId: { codecId: 'pg/text@1', nullable: false },
        roomId: { codecId: 'pg/text@1', nullable: false },
        direct: { codecId: 'pg/bool@1', nullable: false },
        unread: { codecId: 'pg/bool@1', nullable: false },
        at: { codecId: 'pg/text@1', nullable: false },
      })
      .build();

    return (await this.prisma.runtime().query(plan)) as MentionRow[];
  }

  private async toItems(rows: MentionRow[]): Promise<MyMention[]> {
    if (rows.length === 0) {
      return [];
    }

    const messageIds = rows.map((row) => row.messageId);
    const messages = (await this.prisma.orm.public.Message.where((f) =>
      f.id.in(messageIds),
    ).all()) as MessageRow[];
    const messagesById = new Map(messages.map((m) => [m.id, m]));

    const targets = (await this.prisma.orm.public.MessageMentionTarget.where((f) =>
      f.messageId.in(messageIds),
    )
      .orderBy((f) => f.position.asc())
      .all()) as MentionTargetRow[];
    const targetsByMessage = new Map<string, MentionTargetRow[]>();
    for (const target of targets) {
      targetsByMessage.set(target.messageId, [
        ...(targetsByMessage.get(target.messageId) ?? []),
        target,
      ]);
    }

    const reactionsByMessage = groupReactions(
      (await this.prisma.orm.public.Reaction.where((f) =>
        f.messageId.in(messageIds),
      ).all()) as ReactionRow[],
    );

    const roomIds = [...new Set(rows.map((row) => row.roomId))];
    const rooms = (await this.prisma.orm.public.Room.where((f) =>
      f.id.in(roomIds),
    ).all()) as Array<{
      id: string;
      type: MyMention['room']['type'];
      name: string | null;
      parentId: string | null;
    }>;
    const roomsById = new Map(rooms.map((r) => [r.id, r]));

    return rows.flatMap((row) => {
      const message = messagesById.get(row.messageId);
      const room = roomsById.get(row.roomId);
      if (!message || !room) {
        return [];
      }
      const mentionsMe = row.direct ? ('direct' as const) : ('collective' as const);

      return [
        {
          message: toMessageView(
            message,
            (targetsByMessage.get(row.messageId) ?? []).map(toMentionTarget),
            mentionsMe,
            reactionsByMessage.get(row.messageId) ?? [],
          ),
          room: { id: room.id, type: room.type, name: room.name, parentId: room.parentId },
          mentionsMe,
          unread: row.unread,
        },
      ];
    });
  }
}
