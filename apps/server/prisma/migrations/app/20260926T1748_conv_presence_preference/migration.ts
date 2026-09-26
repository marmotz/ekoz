#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2304c06f408a2b4098270a2a5aa822173011bddc543e6b9974e35de62631afa5/contract';
import endContract from '../../snapshots/2304c06f408a2b4098270a2a5aa822173011bddc543e6b9974e35de62631afa5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6299cf899070292540d8f1ac30a762ac8e0b8daca7b265c646787db5c8c12d20/contract';
import startContract from '../../snapshots/6299cf899070292540d8f1ac30a762ac8e0b8daca7b265c646787db5c8c12d20/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'presence_preference',
        columns: [
          col('manual_away', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
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
