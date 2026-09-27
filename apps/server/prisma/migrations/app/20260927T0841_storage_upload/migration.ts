#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7bac4d33d0d5b538fec0c703d35c4685450f94e6d32c32a4ae0751ef82fc38a9/contract';
import endContract from '../../snapshots/7bac4d33d0d5b538fec0c703d35c4685450f94e6d32c32a4ae0751ef82fc38a9/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fb73ab2606f7d239bbffe6715d5ebfc4e648b7b0d99be7568ea5eb14c920b291/contract';
import startContract from '../../snapshots/fb73ab2606f7d239bbffe6715d5ebfc4e648b7b0d99be7568ea5eb14c920b291/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'upload',
        columns: [
          col('blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expires_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('failure', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('length', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('offset', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('state', 'text', {
            notNull: true,
            default: lit('receiving'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'upload_state_check_e196e825',
            "\"state\" IN ('receiving', 'ready', 'failed')",
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'upload',
        index: 'upload_expires_at_idx_35365ada',
        columns: ['expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'upload',
        index: 'upload_user_id_state_idx_241eaac3',
        columns: ['user_id', 'state'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
