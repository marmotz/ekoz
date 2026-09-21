import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';

const migrationDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/app/20260921T1913_conv_creator_membership_backfill',
);

/**
 * The creator-membership backfill migration (issue #62): one membership per
 * live `space` / `channel` that has none, `space_admin` / `room_admin` by type.
 */
describe('conversations — creator membership backfill (integration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  const createRoom = async (
    type: 'space' | 'channel' | 'dm',
    createdById: string | null,
    deletedAt: string | null = null,
  ): Promise<string> => {
    const room = (await database.db.orm.public.Room.create({
      type,
      parentId: null,
      visibility: 'private',
      slug: null,
      name: `${type}-room`,
      topic: null,
      defaultRole: 'member',
      readOnly: false,
      originServer: 'ekoz.example.com',
      lastSeq: 0n,
      retention: { mode: 'inherit' },
      createdById,
      deletedAt,
      updatedAt: new Date().toISOString(),
    })) as { id: string };

    return room.id;
  };

  const runBackfill = async (): Promise<void> => {
    const ops = JSON.parse(readFileSync(path.join(migrationDir, 'ops.json'), 'utf8')) as Array<{
      execute: Array<{ sql: string }>;
    }>;
    for (const op of ops) {
      for (const step of op.execute) {
        const strings = Object.assign([step.sql], { raw: [step.sql] }) as TemplateStringsArray;
        await database.db.runtime().execute(database.db.raw.sql(strings).returnsRow({}).build());
      }
    }
  };

  it('backfills creators of live spaces and channels only, and is idempotent', async () => {
    const space = await createRoom('space', 'creator-1');
    const channel = await createRoom('channel', 'creator-2');
    const deleted = await createRoom('space', 'creator-3', new Date().toISOString());
    const dm = await createRoom('dm', 'creator-4');
    const noCreator = await createRoom('space', null);
    const alreadyMember = await createRoom('space', 'creator-5');
    await database.db.orm.public.Membership.create({
      roomId: alreadyMember,
      userId: 'creator-5',
      role: 'moderator',
      invitedById: null,
    });

    await runBackfill();
    await runBackfill();

    const rows = (await database.db.orm.public.Membership.all()) as Array<{
      roomId: string;
      userId: string;
      role: string;
    }>;
    const byRoom = new Map(rows.map((r) => [r.roomId, r]));

    expect(byRoom.get(space)).toMatchObject({ userId: 'creator-1', role: 'space_admin' });
    expect(byRoom.get(channel)).toMatchObject({ userId: 'creator-2', role: 'room_admin' });
    expect(byRoom.get(alreadyMember)).toMatchObject({ userId: 'creator-5', role: 'moderator' });
    expect(byRoom.has(deleted)).toBe(false);
    expect(byRoom.has(dm)).toBe(false);
    expect(byRoom.has(noCreator)).toBe(false);
    expect(rows).toHaveLength(3);
  });
});
