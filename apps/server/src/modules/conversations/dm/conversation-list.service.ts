import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { type RoomRow, toRoomView } from '../rooms/room.view.js';
import type {
  ConversationListItem,
  ConversationListResponse,
  ConversationParticipant,
} from './conversation.view.js';

interface ConversationRow extends Omit<RoomRow, 'deletedAt'> {
  lastActivityAt: string;
}

/**
 * The caller's `dm` and `group_dm` (`GET /me/conversations`). A conversation is
 * listed when the caller has not hidden it, it is not deleted, and it either
 * has a message or was created by the caller (so a `dm` recipient sees it from
 * the first message on), or is a `group_dm`, which every member sees from its
 * creation. Ordered by last activity, counting only the messages the
 * caller can read (their history floor).
 */
@Injectable()
export class ConversationListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  async listMine(actor: PermissionPrincipal): Promise<ConversationListResponse> {
    const plan = this.prisma.raw.sql`
      SELECT r.id, r.type, r.parent_id AS "parentId", r.visibility, r.slug, r.name, r.topic,
             r.avatar_blob_id AS "avatarBlobId", r.default_role AS "defaultRole",
             r.read_only AS "readOnly", r.origin_server AS "originServer",
             r.last_seq AS "lastSeq", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
             coalesce(activity.last_at, r.created_at) AS "lastActivityAt"
      FROM membership m
      JOIN room r ON r.id = m.room_id
      LEFT JOIN LATERAL (
        SELECT max(msg.created_at) AS last_at
        FROM message msg
        WHERE msg.room_id = r.id
          AND (m.history_from_seq IS NULL OR msg.seq >= m.history_from_seq)
      ) activity ON true
      WHERE m.user_id = ${actor.userId}
        AND m.hidden_at IS NULL
        AND r.deleted_at IS NULL
        AND r.type IN ('dm', 'group_dm')
        AND (
          r.type = 'group_dm'
          OR r.created_by_id = ${actor.userId}
          OR EXISTS (SELECT 1 FROM message any_msg WHERE any_msg.room_id = r.id)
        )
      ORDER BY coalesce(activity.last_at, r.created_at) DESC, r.id ASC
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
        lastActivityAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as ConversationRow[];
    if (rows.length === 0) {
      return { items: [] };
    }

    const roomIds = rows.map((row) => row.id);
    const members = (await this.prisma.orm.public.Membership.where((f) =>
      f.roomId.in(roomIds),
    ).all()) as Array<{ roomId: string; userId: string }>;
    const admins = (await this.prisma.orm.public.RoomMemberPermission.where((f) =>
      and(f.nodeId.in(roomIds), f.capability.eq('room.manage_members'), f.effect.eq('allow')),
    ).all()) as Array<{ nodeId: string; userId: string }>;
    const adminKeys = new Set(admins.map((row) => `${row.nodeId}:${row.userId}`));
    const summaries = await this.userSummaries.readMany(members.map((row) => row.userId));

    const participantsByRoom = new Map<string, ConversationParticipant[]>();
    for (const member of members) {
      const user = summaries.get(member.userId);
      if (member.userId === actor.userId || !user) {
        continue;
      }
      const list = participantsByRoom.get(member.roomId) ?? [];
      list.push({ user, isAdmin: adminKeys.has(`${member.roomId}:${member.userId}`) });
      participantsByRoom.set(member.roomId, list);
    }

    return {
      items: rows.map(
        (row): ConversationListItem => ({
          ...toRoomView({ ...row, deletedAt: null }),
          lastActivityAt: row.lastActivityAt,
          participants: participantsByRoom.get(row.id) ?? [],
          isAdmin: row.type === 'group_dm' && adminKeys.has(`${row.id}:${actor.userId}`),
        }),
      ),
    };
  }
}
