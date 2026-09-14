import { Injectable } from '@nestjs/common';
import type { JsonValue } from '@prisma/orm-postgres/target/codec-types';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  ROOM_EVENT_PAYLOAD_SCHEMAS,
  type RoomEventContent,
  type RoomEventType,
} from './room-event.types.js';

/** The transaction handle every write in this feature shares (technical.md §10). */
export type RoomTx = Parameters<Parameters<PrismaService['transaction']>[0]>[0];

export interface AppendEventInput<T extends RoomEventType> {
  roomId: string;
  type: T;
  senderId: string | null;
  content: RoomEventContent<T>;
}

export interface RoomEventRecord {
  roomId: string;
  seq: bigint;
  type: RoomEventType;
  senderId: string | null;
  content: unknown;
  createdAt: string;
}

/**
 * Per-room event log: the single entry point every state change in this
 * feature goes through (technical.md §10, event-log-and-ordering.md, issue
 * #2). `seq` is allocated inside the caller's transaction by
 * `UPDATE room SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq`,
 * which serialises concurrent writers per room via the row lock — gap-free and
 * monotonic without a separate sequence object.
 *
 * The increment is expressed through the SQL builder's raw-expression escape
 * (`fns.raw` on an `.update(...)` assignment): the ORM lane has no field
 * referencing its own prior value, and a transaction context does not expose
 * the top-level raw-SQL lane (`PrismaService.raw` — full-text search,
 * recursive/closure queries, advisory locks only).
 */
@Injectable()
export class EventLogService {
  async append<T extends RoomEventType>(
    tx: RoomTx,
    input: AppendEventInput<T>,
  ): Promise<RoomEventRecord> {
    const schema = ROOM_EVENT_PAYLOAD_SCHEMAS[input.type];
    const content = schema.parse(input.content);

    const seqPlan = tx.sql.public.room
      .update((_f, fns) => ({ last_seq: fns.raw`last_seq + 1`.returns('pg/int8@1') }))
      .where((f, fns) => fns.eq(f.id, input.roomId))
      .returning('last_seq')
      .build();
    const [seqRow] = await tx.query(seqPlan);
    if (!seqRow) {
      throw new Error(`Room ${input.roomId} does not exist; cannot allocate a seq for it.`);
    }
    const seq = seqRow.last_seq as bigint;

    const event = await tx.orm.public.RoomEvent.create({
      roomId: input.roomId,
      seq,
      type: input.type,
      senderId: input.senderId,
      content: content as JsonValue,
    });

    return event as RoomEventRecord;
  }
}
