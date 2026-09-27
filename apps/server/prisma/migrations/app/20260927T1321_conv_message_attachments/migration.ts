#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/56ad298aac5e5c7a437b0145fab071e3610f405664161629de108bce0af26481/contract';
import endContract from '../../snapshots/56ad298aac5e5c7a437b0145fab071e3610f405664161629de108bce0af26481/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7bac4d33d0d5b538fec0c703d35c4685450f94e6d32c32a4ae0751ef82fc38a9/contract';
import startContract from '../../snapshots/7bac4d33d0d5b538fec0c703d35c4685450f94e6d32c32a4ae0751ef82fc38a9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_02d9b1d8',
      }),
      this.createTable({
        schema: 'public',
        table: 'message_attachment',
        columns: [
          col('blob_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('content_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('size_bytes', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('uploader_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_3c77a9c9',
        expression:
          "\"type\" IN ('message_created', 'message_edited', 'message_redacted', 'message_deleted', 'message_hidden', 'reaction_added', 'reaction_removed', 'member_joined', 'member_left', 'member_kicked', 'member_banned', 'member_unbanned', 'role_changed', 'permission_override_changed', 'room_created', 'room_updated', 'room_moved', 'room_deleted', 'pin_added', 'pin_removed', 'attachment_removed', 'retention_changed', 'receipt_updated', 'group_changed')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'message_attachment',
        index: 'message_attachment_message_id_idx_8a7ff1ba',
        columns: ['message_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'message_attachment',
        index: 'message_attachment_room_id_created_at_idx_3f0ddf95',
        columns: ['room_id', 'created_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
