import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import type { JsonValue } from '@prisma/orm-postgres/target/codec-types';
import type { RoomEventRecord, RoomTx } from '../events/event-log.service.js';

/**
 * Account feed fan-out (technical.md §16, issue #11): when a `room_event` is
 * appended, insert a feed row for each effective member of the room;
 * account-scoped events (invitations, join-request outcomes, ...) are inserted
 * directly by their owning service via {@link pushAccountEvent}.
 *
 * Effective members are the explicit `Membership` rows of the room plus those
 * of its ancestor spaces, one row per distinct user. Simplification: it checks
 * that a membership exists, not the `room.read` capability — every seeded role
 * grants `room.read` by default (a `deny` override is not honoured), and a room
 * with no membership yet (pure-public browsing) has nobody to fan out to
 * regardless; those readers fall back to `GET /sync`. The cost is proportional
 * to the effective members (see `docs/technical/realtime-transport.md`).
 *
 * Runs inside the caller's transaction (same as `EventLogService.append`,
 * which invokes {@link fanOutRoomEvent} directly) rather than as a separate
 * async worker — a pragmatic simplification for this increment. `GET /events`
 * picks up new rows by polling (see `EventsController`), so this only needs to
 * make the row visible to a committed read, not push it itself.
 */
@Injectable()
export class FeedFanoutService {
  async fanOutRoomEvent(tx: RoomTx, event: RoomEventRecord): Promise<void> {
    const userIds = await this.effectiveMemberIds(tx, event.roomId);

    for (const userId of userIds) {
      await tx.orm.public.AccountFeedEvent.create({
        userId,
        roomId: event.roomId,
        roomSeq: event.seq,
        kind: 'room_event',
        payload: {
          type: event.type,
          seq: event.seq.toString(),
          senderId: event.senderId,
          content: event.content,
          createdAt: event.createdAt,
        } as JsonValue,
      });
    }
  }

  /** Distinct users with a membership on the room or on one of its ancestor spaces. */
  private async effectiveMemberIds(tx: RoomTx, roomId: string): Promise<string[]> {
    const ancestors = (await tx.orm.public.RoomClosure.where((f) =>
      and(f.descendantId.eq(roomId), f.depth.gt(0)),
    ).all()) as Array<{ ancestorId: string }>;
    const roomIds = [roomId, ...ancestors.map((row) => row.ancestorId)];

    const memberships = (await tx.orm.public.Membership.where((f) =>
      f.roomId.in(roomIds),
    ).all()) as Array<{ userId: string }>;

    return [...new Set(memberships.map((m) => m.userId))];
  }

  async pushAccountEvent(
    tx: RoomTx,
    userId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.orm.public.AccountFeedEvent.create({
      userId,
      roomId,
      roomSeq: null,
      kind: 'account',
      payload: payload as JsonValue,
    });
  }
}
