import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { RoomTx } from '../events/event-log.service.js';
import type { RoomRole } from '../permissions/role-default-capabilities.js';

export interface EffectiveMember {
  userId: string;
  role: RoomRole;
}

export interface EffectiveMemberPageRow extends EffectiveMember {
  joinedAt: string;
}

/**
 * The effective members of a room: explicit memberships of the room plus those
 * of its ancestor spaces, one entry per distinct user, the nearest membership
 * (smallest `room_closure` depth) winning (technical.md web-client-mentions
 * S2). The single source shared by `GET /rooms/:id/members`, the account feed
 * fan-out and mention resolution.
 */
@Injectable()
export class EffectiveMembersQuery {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every effective member, unpaginated. Pass `tx` to read inside a
   * transaction (the feed fan-out must see the memberships that same
   * transaction just wrote).
   */
  async listAll(roomId: string, tx?: RoomTx): Promise<EffectiveMember[]> {
    const orm = (tx ?? this.prisma).orm;

    const ancestors = (await orm.public.RoomClosure.where({
      descendantId: roomId,
    }).all()) as Array<{ ancestorId: string; depth: number }>;
    const depthByRoom = new Map(ancestors.map((row) => [row.ancestorId, row.depth]));
    depthByRoom.set(roomId, 0);

    const memberships = (await orm.public.Membership.where((f) =>
      f.roomId.in([...depthByRoom.keys()]),
    ).all()) as Array<{ roomId: string; userId: string; role: RoomRole }>;

    const nearest = new Map<string, { role: RoomRole; depth: number }>();
    for (const membership of memberships) {
      const depth = depthByRoom.get(membership.roomId) ?? 0;
      const current = nearest.get(membership.userId);
      if (!current || depth < current.depth) {
        nearest.set(membership.userId, { role: membership.role, depth });
      }
    }

    return [...nearest.entries()]
      .map(([userId, { role }]) => ({ userId, role }))
      .sort((a, b) => (a.userId < b.userId ? -1 : 1));
  }

  /** `limit + 1` rows ordered by `userId`, strictly after `afterUserId` when given. */
  async listPage(
    roomId: string,
    afterUserId: string | null,
    limit: number,
  ): Promise<EffectiveMemberPageRow[]> {
    const hasCursor = afterUserId !== null;
    const plan = this.prisma.raw.sql`
      SELECT DISTINCT ON (m.user_id) m.user_id AS "userId", m.role AS "role",
             m.joined_at AS "joinedAt"
      FROM membership m
      LEFT JOIN room_closure c ON c.ancestor_id = m.room_id AND c.descendant_id = ${roomId}
      WHERE (m.room_id = ${roomId} OR c.ancestor_id IS NOT NULL)
        AND (${hasCursor} = false OR m.user_id > ${afterUserId ?? ''})
      ORDER BY m.user_id ASC, coalesce(c.depth, 0) ASC
      LIMIT ${limit + 1}
    `
      .returnsRow({
        userId: { codecId: 'pg/text@1', nullable: false },
        role: { codecId: 'pg/text@1', nullable: false },
        joinedAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
      })
      .build();

    return (await this.prisma.runtime().query(plan)) as EffectiveMemberPageRow[];
  }
}
