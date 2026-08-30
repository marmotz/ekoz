#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c52f56674690138daba500fb5f9fa858764576d65d1719d5e621dded3bef3f37/contract';
import endContract from '../../snapshots/c52f56674690138daba500fb5f9fa858764576d65d1719d5e621dded3bef3f37/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'settings',
        columns: [
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updated_by', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [primaryKey(['key'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
