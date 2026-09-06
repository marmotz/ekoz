#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2e02be4335ee01be82b171db223a5906098768842cefc3f4c46b736856198d4f/contract';
import startContract from '../../snapshots/2e02be4335ee01be82b171db223a5906098768842cefc3f4c46b736856198d4f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9d069e8b153ec6ab6a3bbab0e4db05ee1207c7e87359885a48b76c363e9a1aed/contract';
import endContract from '../../snapshots/9d069e8b153ec6ab6a3bbab0e4db05ee1207c7e87359885a48b76c363e9a1aed/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'server_identity',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('domain', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
