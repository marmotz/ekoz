#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/bd889d18ea39917148ac0d79619b3145e1626c49e79ac382473424a936d98fe4/contract';
import endContract from '../../snapshots/bd889d18ea39917148ac0d79619b3145e1626c49e79ac382473424a936d98fe4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fe381f407a5b29c816375a9dd2df069b0fedee02dfce9d837a491b2ea8f7a859/contract';
import startContract from '../../snapshots/fe381f407a5b29c816375a9dd2df069b0fedee02dfce9d837a491b2ea8f7a859/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'message',
        columns: [
          col('author_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('edited_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('hidden_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('redacted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('redacted_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reply_to_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('seq', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'message_mention',
        columns: [
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['message_id', 'user_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'message_pin',
        columns: [
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pinned_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('pinned_by_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['room_id', 'message_id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'message',
        constraint: 'message_room_id_seq_key',
        columns: ['room_id', 'seq'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message',
        index: 'message_reply_to_id_idx_384c8aaa',
        columns: ['reply_to_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message',
        index: 'message_room_id_created_at_idx_3f0ddf95',
        columns: ['room_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message_mention',
        index: 'message_mention_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
