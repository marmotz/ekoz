#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2a2cef9cf3b3f14f82c8fd6c3e672793e444790c01ae655e75fb787be007fe68/contract';
import startContract from '../../snapshots/2a2cef9cf3b3f14f82c8fd6c3e672793e444790c01ae655e75fb787be007fe68/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/2e02be4335ee01be82b171db223a5906098768842cefc3f4c46b736856198d4f/contract';
import endContract from '../../snapshots/2e02be4335ee01be82b171db223a5906098768842cefc3f4c46b736856198d4f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'server_signing_key',
        columns: [
          col('activated_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('algorithm', 'text', {
            notNull: true,
            default: lit('ed25519'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('private_key_enc', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('public_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('retired_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'server_signing_key',
        index: 'server_signing_key_activated_at_idx_b6f7876e',
        columns: ['activated_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
