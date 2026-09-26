/**
 * Local-development seed (`bun run db:seed`). Idempotent: creates the "Test"
 * space, its public "test" channel and 100 throwaway users who all join the
 * channel. Existing rows are reused. Needs an existing owner account (first-run
 * setup) and refuses to run in production.
 *
 * Users share the password from `DEV_SEED_PASSWORD`.
 */
import { hashSync } from '@node-rs/argon2';
import { ulid } from 'ulid';
import {
  buildDevSeedUsers,
  DEV_SEED_CHANNEL_NAME,
  DEV_SEED_PASSWORD,
  DEV_SEED_SPACE_NAME,
  memberJoinedContent,
} from '../src/core/prisma/seed/dev-seed.js';
import { ARGON2_PARAMS } from '../src/modules/identity/accounts/password.service.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run the development seed in production.');
}

const sql = Bun.sql;
const origin = process.env.EKOZ_SERVER__DOMAIN;
if (!origin) throw new Error('EKOZ_SERVER__DOMAIN is not set.');

type Tx = Parameters<Parameters<typeof sql.begin>[0]>[0];

/** Appends an event to a room log, bumping `room.last_seq`. */
async function appendEvent(
  tx: Tx,
  roomId: string,
  type: string,
  senderId: string,
  content: unknown,
): Promise<void> {
  const [{ last_seq: seq }] = await tx`
    UPDATE room SET last_seq = last_seq + 1 WHERE id = ${roomId} RETURNING last_seq`;
  await tx`
    INSERT INTO room_event (room_id, seq, type, sender_id, content, origin_server)
    VALUES (${roomId}, ${seq}, ${type}, ${senderId}, ${JSON.stringify(content)}::jsonb, ${origin})`;
}

async function join(tx: Tx, roomId: string, userId: string, role: string): Promise<boolean> {
  const inserted = await tx`
    INSERT INTO membership (room_id, user_id, role) VALUES (${roomId}, ${userId}, ${role})
    ON CONFLICT DO NOTHING RETURNING user_id`;
  if (inserted.length === 0) return false;
  await appendEvent(tx, roomId, 'member_joined', userId, memberJoinedContent(userId, role));
  return true;
}

async function createRoom(
  tx: Tx,
  owner: string,
  type: 'space' | 'channel',
  name: string,
  parentId: string | null,
  ownerRole: string,
): Promise<string> {
  const id = ulid();
  await tx`
    INSERT INTO room (id, type, name, parent_id, visibility, default_role, origin_server, created_by_id, retention, updated_at)
    VALUES (${id}, ${type}, ${name}, ${parentId}, 'public', 'member', ${origin}, ${owner}, '{"mode":"inherit"}'::jsonb, now())`;
  await appendEvent(tx, id, 'room_created', owner, {
    type,
    parentId,
    visibility: 'public',
    name,
  });
  await join(tx, id, owner, ownerRole);
  return id;
}

const passwordHash = hashSync(DEV_SEED_PASSWORD, ARGON2_PARAMS);

await sql.begin(async (tx) => {
  const [owner] = await tx`SELECT id FROM "user" WHERE is_owner LIMIT 1`;
  if (!owner) throw new Error('No owner account: complete the first-run setup before seeding.');
  const ownerId: string = owner.id;

  const [space] = await tx`
    SELECT id FROM room WHERE type = 'space' AND parent_id IS NULL AND name = ${DEV_SEED_SPACE_NAME} LIMIT 1`;
  const spaceId: string =
    space?.id ?? (await createRoom(tx, ownerId, 'space', DEV_SEED_SPACE_NAME, null, 'space_admin'));

  const [channel] = await tx`
    SELECT id FROM room WHERE type = 'channel' AND parent_id = ${spaceId} AND name = ${DEV_SEED_CHANNEL_NAME} LIMIT 1`;
  const channelId: string =
    channel?.id ??
    (await createRoom(tx, ownerId, 'channel', DEV_SEED_CHANNEL_NAME, spaceId, 'room_admin'));

  let created = 0;
  let joined = 0;
  for (const user of buildDevSeedUsers()) {
    const [existing] = await tx`SELECT id FROM "user" WHERE name = ${user.name}`;
    let userId: string = existing?.id;
    if (!userId) {
      userId = ulid();
      await tx`
        INSERT INTO "user" (id, name, email, email_verified_at, password_hash, updated_at)
        VALUES (${userId}, ${user.name}, ${user.email}, now(), ${passwordHash}, now())`;
      await tx`
        INSERT INTO user_profile (user_id, display_name, updated_at)
        VALUES (${userId}, ${user.displayName}, now())`;
      created++;
    }
    if (await join(tx, channelId, userId, 'member')) joined++;
  }
  console.log(
    `Seed done: ${created} users created, ${joined} joined ${DEV_SEED_SPACE_NAME}/${DEV_SEED_CHANNEL_NAME}.`,
  );
});
