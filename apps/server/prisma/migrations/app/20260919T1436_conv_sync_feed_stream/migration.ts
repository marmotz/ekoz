#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/58b67f841bd9230a16cb7d0f4f3c97535557e96b60caaea936958a0ba00cd8bd/contract';
import startContract from '../../snapshots/58b67f841bd9230a16cb7d0f4f3c97535557e96b60caaea936958a0ba00cd8bd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5c906b8f045aa6a6276b19679d29a61e79af27f7b16bbef50fc8daa7a1c15f94/contract';
import endContract from '../../snapshots/5c906b8f045aa6a6276b19679d29a61e79af27f7b16bbef50fc8daa7a1c15f94/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'account_feed_event',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('feed_seq', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('payload', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('room_seq', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['user_id', 'feed_seq'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'account_feed_event',
        index: 'account_feed_event_user_id_created_at_idx_b562028f',
        columns: ['user_id', 'created_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
