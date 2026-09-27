#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/56ad298aac5e5c7a437b0145fab071e3610f405664161629de108bce0af26481/contract';
import startContract from '../../snapshots/56ad298aac5e5c7a437b0145fab071e3610f405664161629de108bce0af26481/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9a78b92efef249ea7b1ea08f7890ba5ef4eac36e9703456da8f1dfebcd3e205e/contract';
import endContract from '../../snapshots/9a78b92efef249ea7b1ea08f7890ba5ef4eac36e9703456da8f1dfebcd3e205e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'link_preview',
        columns: [
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('fetched_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('image_blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('site_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'link_preview_status_check_27d2066a',
            "\"status\" IN ('ready', 'failed')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'message_link_preview',
        columns: [
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('image_blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('site_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['message_id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'link_preview',
        constraint: 'link_preview_url_key',
        columns: ['url'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'link_preview',
        index: 'link_preview_status_fetched_at_idx_30a983cc',
        columns: ['status', 'fetched_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
