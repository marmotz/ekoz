#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/70724003d57754908cdda405cd0a68c41db1a523e3c12b3bef071c48881e10aa/contract';
import startContract from '../../snapshots/70724003d57754908cdda405cd0a68c41db1a523e3c12b3bef071c48881e10aa/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a071ba98881c6e5df9faa693cd8f61605aa84ec245971d9c22d5db635a4c95ab/contract';
import endContract from '../../snapshots/a071ba98881c6e5df9faa693cd8f61605aa84ec245971d9c22d5db635a4c95ab/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';

const { raw, contract } = postgres<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('duration_ms', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('height', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('thumbnail_blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('uploader_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('width', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'blob',
        column: col('touched_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.dataTransform(contract, 'backfill-blob-touched_at', {
        check: () =>
          raw.sql`SELECT id FROM blob WHERE touched_at IS NULL LIMIT 1`.returnsRow({
            id: 'pg/text@1',
          }),
        run: () => raw.sql`UPDATE blob SET touched_at = created_at WHERE touched_at IS NULL`.affectedCount(),
      }),
      this.dataTransform(contract, 'backfill-blob-uploader_id', {
        check: () =>
          raw.sql`
            SELECT blob.id FROM blob
            JOIN user_profile ON user_profile.avatar_blob_id = blob.id
            WHERE blob.uploader_id IS NULL
            LIMIT 1
          `.returnsRow({ id: 'pg/text@1' }),
        run: () =>
          raw.sql`
            UPDATE blob SET uploader_id = user_profile.user_id
            FROM user_profile
            WHERE user_profile.avatar_blob_id = blob.id AND blob.uploader_id IS NULL
          `.affectedCount(),
      }),
      this.setNotNull({ schema: 'public', table: 'blob', column: 'touched_at' }),
      this.alterColumnType({
        schema: 'public',
        table: 'blob',
        column: 'size_bytes',
        options: {
          qualifiedTargetType: 'int8',
          formatTypeExpected: 'bigint',
          rawTargetTypeForLabel: 'int8',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'blob',
        index: 'blob_uploader_id_idx_7e6af2c2',
        columns: ['uploader_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
