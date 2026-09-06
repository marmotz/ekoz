#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1a6661c8ab42191907eed8a982e33e97c42f199f53fcd4777b5bbabf67b4d298/contract';
import endContract from '../../snapshots/1a6661c8ab42191907eed8a982e33e97c42f199f53fcd4777b5bbabf67b4d298/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cba00781b2ff33b0c6176ad714a3eaed1c57c499ac10146a037f6c5843a9a835/contract';
import startContract from '../../snapshots/cba00781b2ff33b0c6176ad714a3eaed1c57c499ac10146a037f6c5843a9a835/contract.json' with { type: 'json' };
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
        table: 'password_reset',
        columns: [
          col('consumed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expires_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requested_ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'username_change_request',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requested_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolved_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('resolved_by_user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'username_change_request_status_check_19a2b525',
            "\"status\" IN ('pending', 'approved', 'rejected')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'password_reset',
        constraint: 'password_reset_token_hash_key',
        columns: ['token_hash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'password_reset',
        index: 'password_reset_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'username_change_request',
        index: 'username_change_request_status_idx_e98638ab',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
