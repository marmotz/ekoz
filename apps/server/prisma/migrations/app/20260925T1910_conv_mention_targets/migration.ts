#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6299cf899070292540d8f1ac30a762ac8e0b8daca7b265c646787db5c8c12d20/contract';
import endContract from '../../snapshots/6299cf899070292540d8f1ac30a762ac8e0b8daca7b265c646787db5c8c12d20/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e40439c091125ae96d4bbfe19e153742aac24a26ecb8eca2470ffcf249511b91/contract';
import startContract from '../../snapshots/e40439c091125ae96d4bbfe19e153742aac24a26ecb8eca2470ffcf249511b91/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'message_mention_recipient',
        columns: [
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('seq', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('target', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['message_id', 'type', 'target', 'user_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'message_mention_target',
        columns: [
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('target', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['message_id', 'type', 'target'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message_mention_recipient',
        index: 'message_mention_recipient_message_id_idx_8a7ff1ba',
        columns: ['message_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message_mention_recipient',
        index: 'message_mention_recipient_user_id_room_id_seq_idx_9da19553',
        columns: ['user_id', 'room_id', 'seq'],
      }),
      // Every existing mention becomes a `user` target whose token is frozen now
      // (`@` + current identifier, `@deleted` for a gone account) and a recipient
      // at the message's own seq. The author is never in their own audience.
      rawSql({
        id: 'data.backfill-message-mention-targets',
        label: 'Backfill mention targets and recipients from message_mention',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'Insert one user target per existing mention',
            sql: `INSERT INTO "public"."message_mention_target" ("message_id", "type", "target", "token", "position")
SELECT mm."message_id", 'user', mm."user_id",
  CASE
    WHEN u."id" IS NULL OR u."status"::text = 'deleted' OR u."name" IS NULL OR si."domain" IS NULL THEN '@deleted'
    ELSE '@' || u."name" || '/' || si."domain"
  END,
  (row_number() OVER (PARTITION BY mm."message_id" ORDER BY mm."user_id") - 1)::int
FROM "public"."message_mention" mm
LEFT JOIN "public"."user" u ON u."id" = mm."user_id"
LEFT JOIN "public"."server_identity" si ON si."id" = 'server'
ON CONFLICT DO NOTHING`,
            params: [],
          },
          {
            description: 'Insert one recipient per existing mention, at the message seq',
            sql: `INSERT INTO "public"."message_mention_recipient" ("message_id", "type", "target", "user_id", "room_id", "seq")
SELECT mm."message_id", 'user', mm."user_id", mm."user_id", m."room_id", m."seq"
FROM "public"."message_mention" mm
JOIN "public"."message" m ON m."id" = mm."message_id"
WHERE m."author_id" IS DISTINCT FROM mm."user_id"
ON CONFLICT DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      this.dropTable({ schema: 'public', table: 'message_mention' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
