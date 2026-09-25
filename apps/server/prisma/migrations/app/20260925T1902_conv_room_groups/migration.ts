#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/40480fe9c202bda5aa0d8d492c66e054d8d335ea5d506f0de3faa39865e2adc4/contract';
import startContract from '../../snapshots/40480fe9c202bda5aa0d8d492c66e054d8d335ea5d506f0de3faa39865e2adc4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e40439c091125ae96d4bbfe19e153742aac24a26ecb8eca2470ffcf249511b91/contract';
import endContract from '../../snapshots/e40439c091125ae96d4bbfe19e153742aac24a26ecb8eca2470ffcf249511b91/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_eaaedd9c',
      }),
      this.createTable({
        schema: 'public',
        table: 'room_group',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('created_by_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('node_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_group_member',
        columns: [
          col('added_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('group_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['group_id', 'user_id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_02d9b1d8',
        expression:
          "\"type\" IN ('message_created', 'message_edited', 'message_redacted', 'message_deleted', 'message_hidden', 'reaction_added', 'reaction_removed', 'member_joined', 'member_left', 'member_kicked', 'member_banned', 'member_unbanned', 'role_changed', 'permission_override_changed', 'room_created', 'room_updated', 'room_moved', 'room_deleted', 'pin_added', 'pin_removed', 'retention_changed', 'receipt_updated', 'group_changed')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'room_group',
        constraint: 'room_group_node_id_name_key',
        columns: ['node_id', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_group',
        index: 'room_group_node_id_idx_c068255a',
        columns: ['node_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_group_member',
        index: 'room_group_member_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
