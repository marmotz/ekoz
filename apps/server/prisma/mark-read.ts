/**
 * Local-development helper (`bun run db:mark-read <channel name>`): moves the
 * read marker of every effective member of a channel (explicit members of the
 * channel or of an ancestor space) up to the channel's latest event (receipts excluded, so re-runs are no-ops), as if
 * everyone had seen all messages. Markers only move forward; each change is
 * logged as a `receipt_updated` event, like the real endpoint does.
 */
import { MARK_READ_USAGE, parseMarkReadArgs } from '../src/core/prisma/seed/mark-read.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run the development helper in production.');
}

const sql = Bun.sql;
const origin = process.env.EKOZ_SERVER__DOMAIN;
if (!origin) throw new Error('EKOZ_SERVER__DOMAIN is not set.');

let channelName: string;
try {
  ({ channelName } = parseMarkReadArgs(process.argv.slice(2)));
} catch (error) {
  console.error((error as Error).message ?? MARK_READ_USAGE);
  process.exit(1);
}

await sql.begin(async (tx) => {
  const rooms = await tx`
    SELECT r.id, r.parent_id,
      (SELECT COALESCE(MAX(e.seq), 0) FROM room_event e
        WHERE e.room_id = r.id AND e.type <> 'receipt_updated') AS last_seq
    FROM room r
    WHERE r.name = ${channelName} AND r.type = 'channel' AND r.deleted_at IS NULL`;
  if (rooms.length === 0) throw new Error(`No channel named "${channelName}".`);
  if (rooms.length > 1) {
    throw new Error(
      `Several channels named "${channelName}": ${rooms.map((r: { id: string }) => r.id).join(', ')}.`,
    );
  }
  const room = rooms[0];
  const roomId: string = room.id;
  const seq = BigInt(room.last_seq);

  // Room plus its ancestor spaces: explicit membership on any of them counts.
  const chain: string[] = [roomId];
  for (let parent: string | null = room.parent_id; parent; ) {
    chain.push(parent);
    const [row] = await tx`SELECT parent_id FROM room WHERE id = ${parent}`;
    parent = row?.parent_id ?? null;
  }

  const members = await tx`
    SELECT DISTINCT m.user_id FROM membership m
    JOIN "user" u ON u.id = m.user_id
    WHERE m.room_id IN ${tx(chain)} AND u.deleted_at IS NULL`;

  let updated = 0;
  for (const { user_id: userId } of members) {
    const changed = await tx`
      INSERT INTO read_marker (room_id, user_id, seq, updated_at)
      VALUES (${roomId}, ${userId}, ${seq.toString()}, now())
      ON CONFLICT (room_id, user_id) DO UPDATE SET seq = EXCLUDED.seq, updated_at = now()
      WHERE read_marker.seq < EXCLUDED.seq
      RETURNING user_id`;
    if (changed.length === 0) continue;
    const [{ last_seq: eventSeq }] = await tx`
      UPDATE room SET last_seq = last_seq + 1 WHERE id = ${roomId} RETURNING last_seq`;
    await tx`
      INSERT INTO room_event (room_id, seq, type, sender_id, content, origin_server)
      VALUES (${roomId}, ${eventSeq}, 'receipt_updated', ${userId},
        ${JSON.stringify({ userId, seq: seq.toString() })}::jsonb, ${origin})`;
    updated++;
  }
  console.log(
    `"${channelName}": ${updated} of ${members.length} members marked as read up to seq ${seq}.`,
  );
});
