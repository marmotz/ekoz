#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/58b67f841bd9230a16cb7d0f4f3c97535557e96b60caaea936958a0ba00cd8bd/contract';
import endContract from '../../snapshots/58b67f841bd9230a16cb7d0f4f3c97535557e96b60caaea936958a0ba00cd8bd/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a9714f71132db57054704f04a75a2152ef393fafb22465164e2d11a1c17cbcca/contract';
import startContract from '../../snapshots/a9714f71132db57054704f04a75a2152ef393fafb22465164e2d11a1c17cbcca/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'reaction',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('emoji', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['message_id', 'user_id', 'emoji'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'read_marker',
        columns: [
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('seq', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['room_id', 'user_id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reaction',
        index: 'reaction_message_id_idx_8a7ff1ba',
        columns: ['message_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
