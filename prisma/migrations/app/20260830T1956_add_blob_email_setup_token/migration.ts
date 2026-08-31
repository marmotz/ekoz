#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9d069e8b153ec6ab6a3bbab0e4db05ee1207c7e87359885a48b76c363e9a1aed/contract';
import startContract from '../../snapshots/9d069e8b153ec6ab6a3bbab0e4db05ee1207c7e87359885a48b76c363e9a1aed/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e4c3c78ae597e16464785433712e04b567897ded5739b455077d12d994110eba/contract';
import endContract from '../../snapshots/e4c3c78ae597e16464785433712e04b567897ded5739b455077d12d994110eba/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'blob',
        columns: [
          col('content_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ref_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('size_bytes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('storage_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'email_message',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('dedupe_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sent_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('template', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('to', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'setup_token',
        columns: [
          col('consumed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'blob',
        constraint: 'blob_hash_key',
        columns: ['hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'email_message',
        constraint: 'email_message_dedupe_key_key',
        columns: ['dedupe_key'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'blob',
        index: 'blob_ref_count_idx_73a05b87',
        columns: ['ref_count'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
