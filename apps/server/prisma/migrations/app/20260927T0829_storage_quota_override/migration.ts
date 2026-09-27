#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/a071ba98881c6e5df9faa693cd8f61605aa84ec245971d9c22d5db635a4c95ab/contract';
import startContract from '../../snapshots/a071ba98881c6e5df9faa693cd8f61605aa84ec245971d9c22d5db635a4c95ab/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fb73ab2606f7d239bbffe6715d5ebfc4e648b7b0d99be7568ea5eb14c920b291/contract';
import endContract from '../../snapshots/fb73ab2606f7d239bbffe6715d5ebfc4e648b7b0d99be7568ea5eb14c920b291/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'storage_quota_override',
        columns: [
          col('quota_bytes', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['user_id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
