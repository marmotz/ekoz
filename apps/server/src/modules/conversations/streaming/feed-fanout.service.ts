import { Injectable } from '@nestjs/common';
import type { JsonValue } from '@prisma/orm-postgres/target/codec-types';
import type { RoomEventRecord, RoomTx } from '../events/event-log.service.js';
import { EffectiveMembersQuery } from '../membership/effective-members.query.js';

/**
 * Account feed fan-out (technical.md §16, issue #11): when a `room_event` is
 * appended, insert a feed row for each effective member of the room;
 * account-scoped events (invitations, join-request outcomes, ...) are inserted
 * directly by their owning service via {@link pushAccountEvent}.
 *
 * Effective members come from {@link EffectiveMembersQuery}. Simplification: it checks
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
  constructor(private readonly effectiveMembers: EffectiveMembersQuery) {}

  async fanOutRoomEvent(tx: RoomTx, event: RoomEventRecord): Promise<void> {
    const members = await this.effectiveMembers.listAll(event.roomId, tx);

    for (const { userId } of members) {
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
