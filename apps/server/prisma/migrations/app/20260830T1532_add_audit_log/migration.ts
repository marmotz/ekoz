#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2a2cef9cf3b3f14f82c8fd6c3e672793e444790c01ae655e75fb787be007fe68/contract';
import endContract from '../../snapshots/2a2cef9cf3b3f14f82c8fd6c3e672793e444790c01ae655e75fb787be007fe68/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c52f56674690138daba500fb5f9fa858764576d65d1719d5e621dded3bef3f37/contract';
import startContract from '../../snapshots/c52f56674690138daba500fb5f9fa858764576d65d1719d5e621dded3bef3f37/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'audit_log',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actor_ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('actor_user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('target_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('target_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_log',
        index: 'audit_log_actor_user_id_idx_c46ca325',
        columns: ['actor_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_log',
        index: 'audit_log_at_idx_a7b89566',
        columns: ['at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
