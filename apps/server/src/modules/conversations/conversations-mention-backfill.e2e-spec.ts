import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';

const migrationDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/app/20260925T1910_conv_mention_targets',
);

/**
 * The mention targets migration (web-client-mentions technical.md S1): every
 * legacy `message_mention` row becomes a `user` target with a frozen token and
 * a recipient at the message seq, and the old table is dropped. The test
 * database is already migrated, so the old table is recreated by hand, seeded,
 * and the migration's data statements are replayed from `ops.json`.
 */
describe('conversations — mention targets backfill (integration)', () => {
  let database: TestDatabase;
  const domain = 'ekoz.example.com';

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  const exec = async (sql: string): Promise<void> => {
    const strings = Object.assign([sql], { raw: [sql] }) as TemplateStringsArray;
    await database.db.runtime().execute(database.db.raw.sql(strings).returnsRow({}).build());
  };

  const runBackfill = async (): Promise<void> => {
    const ops = JSON.parse(readFileSync(path.join(migrationDir, 'ops.json'), 'utf8')) as Array<{
      id: string;
      execute: Array<{ sql: string }>;
    }>;
    const backfill = ops.find((op) => op.id === 'data.backfill-message-mention-targets');
    expect(backfill).toBeDefined();
    for (const step of backfill?.execute ?? []) {
      await exec(step.sql);
    }
  };

  const createUser = async (name: string | null, status: 'active' | 'deleted' = 'active') =>
    (
      (await database.db.orm.public.User.create({
        name,
        email: name ? `${name}@${domain}` : null,
        emailVerifiedAt: null,
        passwordHash: 'x',
        isOwner: false,
        status,
        updatedAt: new Date().toISOString(),
      })) as { id: string }
    ).id;

  it('turns each mention into a user target and a recipient, author excluded', async () => {
    await database.db.orm.public.ServerIdentity.create({ id: 'server', domain });
    const author = await createUser('author');
    const alice = await createUser('alice');
    const gone = await createUser(null, 'deleted');

    const room = (await database.db.orm.public.Room.create({
      type: 'channel',
      parentId: null,
      visibility: 'public',
      slug: null,
      name: 'backfill-room',
      topic: null,
      defaultRole: 'member',
      readOnly: false,
      originServer: domain,
      lastSeq: 0n,
      retention: { mode: 'inherit' },
      createdById: author,
      deletedAt: null,
      updatedAt: new Date().toISOString(),
    })) as { id: string };
    const message = async (seq: bigint, authorId: string) =>
      (
        (await database.db.orm.public.Message.create({
          roomId: room.id,
          seq,
          authorId,
          body: 'hi',
          replyToId: null,
          editedAt: null,
          redactedAt: null,
          redactedById: null,
          hiddenAt: null,
        })) as { id: string }
      ).id;
    const first = await message(7n, author);
    const second = await message(9n, alice);

    await exec(
      'CREATE TABLE "public"."message_mention" ("message_id" text NOT NULL, "user_id" text NOT NULL, PRIMARY KEY ("message_id", "user_id"))',
    );
    const legacy: Array<[string, string]> = [
      [first, alice],
      [first, gone],
      [first, author],
      [second, alice],
      [second, author],
    ];
    for (const [messageId, userId] of legacy) {
      await exec(
        `INSERT INTO "public"."message_mention" ("message_id", "user_id") VALUES ('${messageId}', '${userId}')`,
      );
    }

    await runBackfill();
    // Idempotent: a second replay changes nothing.
    await runBackfill();

    const targets = (await database.db.orm.public.MessageMentionTarget.all()) as Array<{
      messageId: string;
      type: string;
      target: string;
      token: string;
    }>;
    const tokenOf = (messageId: string, userId: string) =>
      targets.find((t) => t.messageId === messageId && t.target === userId)?.token;

    expect(targets).toHaveLength(5);
    expect(targets.every((t) => t.type === 'user')).toBe(true);
    expect(tokenOf(first, alice)).toBe(`@alice/${domain}`);
    expect(tokenOf(first, author)).toBe(`@author/${domain}`);
    // A gone account keeps a token that never matches a body.
    expect(tokenOf(first, gone)).toBe('@deleted');
    expect(tokenOf(second, alice)).toBe(`@alice/${domain}`);

    const recipients = (await database.db.orm.public.MessageMentionRecipient.all()) as Array<{
      messageId: string;
      target: string;
      userId: string;
      roomId: string;
      seq: bigint;
    }>;
    const summary = recipients
      .map((r) => `${r.messageId === first ? 'first' : 'second'}:${r.userId}:${r.seq}`)
      .sort();
    // The author is never in their own audience; each row carries the message seq.
    expect(summary).toEqual([`first:${alice}:7`, `first:${gone}:7`, `second:${author}:9`].sort());
    expect(recipients.every((r) => r.roomId === room.id)).toBe(true);
    expect(recipients.every((r) => r.target === r.userId)).toBe(true);
  });

  it('drops the legacy table in the same migration', () => {
    const ops = JSON.parse(readFileSync(path.join(migrationDir, 'ops.json'), 'utf8')) as Array<{
      id: string;
    }>;
    const ids = ops.map((op) => op.id);

    expect(ids).toContain('dropTable.message_mention');
    // The drop comes after the data is copied.
    expect(ids.indexOf('dropTable.message_mention')).toBeGreaterThan(
      ids.indexOf('data.backfill-message-mention-targets'),
    );
  });
});
