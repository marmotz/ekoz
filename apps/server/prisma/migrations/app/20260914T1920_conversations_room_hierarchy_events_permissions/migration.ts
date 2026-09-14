#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1a6661c8ab42191907eed8a982e33e97c42f199f53fcd4777b5bbabf67b4d298/contract';
import startContract from '../../snapshots/1a6661c8ab42191907eed8a982e33e97c42f199f53fcd4777b5bbabf67b4d298/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/30b81e67b2f532a5b193a405f9e66c9697c74179a816de6def580c51a8769ab8/contract';
import endContract from '../../snapshots/30b81e67b2f532a5b193a405f9e66c9697c74179a816de6def580c51a8769ab8/contract.json' with { type: 'json' };
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
        table: 'role_default_capability',
        columns: [
          col('capability', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('effect', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['role', 'capability']),
          checkExpression(
            'role_default_capability_effect_check_42ce71e5',
            "\"effect\" IN ('allow', 'deny')",
          ),
          checkExpression(
            'role_default_capability_role_check_9fefc26a',
            "\"role\" IN ('space_admin', 'room_admin', 'moderator', 'member', 'reader')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room',
        columns: [
          col('avatar_blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('created_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('default_role', 'text', {
            notNull: true,
            default: lit('member'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('dm_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last_seq', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('origin_server', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('parent_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('read_only', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('retention', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('slug', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('topic', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('visibility', 'text', {
            notNull: true,
            default: lit('private'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'room_default_role_check_ecb244b3',
            "\"default_role\" IN ('space_admin', 'room_admin', 'moderator', 'member', 'reader')",
          ),
          checkExpression(
            'room_type_check_e5a8a21c',
            "\"type\" IN ('space', 'channel', 'dm', 'group_dm')",
          ),
          checkExpression(
            'room_visibility_check_00a2ae5e',
            "\"visibility\" IN ('public', 'private', 'invite')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_closure',
        columns: [
          col('ancestor_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('depth', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('descendant_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['ancestor_id', 'descendant_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_event',
        columns: [
          col('content', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sender_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seq', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['room_id', 'seq']),
          checkExpression(
            'room_event_type_check_869a5b2b',
            "\"type\" IN ('message_created', 'message_edited', 'message_redacted', 'message_hidden', 'reaction_added', 'reaction_removed', 'member_joined', 'member_left', 'member_kicked', 'member_banned', 'member_unbanned', 'role_changed', 'permission_override_changed', 'room_created', 'room_updated', 'room_moved', 'room_deleted', 'pin_added', 'pin_removed', 'retention_changed', 'receipt_updated')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_member_permission',
        columns: [
          col('capability', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('effect', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('node_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'room_member_permission_effect_check_42ce71e5',
            "\"effect\" IN ('allow', 'deny')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_permission_override',
        columns: [
          col('capability', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('effect', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('node_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'room_permission_override_effect_check_42ce71e5',
            "\"effect\" IN ('allow', 'deny')",
          ),
          checkExpression(
            'room_permission_override_role_check_9fefc26a',
            "\"role\" IN ('space_admin', 'room_admin', 'moderator', 'member', 'reader')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room',
        constraint: 'room_dm_key_key',
        columns: ['dm_key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room_member_permission',
        constraint: 'room_member_permission_node_id_user_id_capability_key',
        columns: ['node_id', 'user_id', 'capability'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room_permission_override',
        constraint: 'room_permission_override_node_id_role_capability_key',
        columns: ['node_id', 'role', 'capability'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room',
        index: 'room_parent_id_idx_ab33b399',
        columns: ['parent_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room',
        index: 'room_type_visibility_idx_894b4660',
        columns: ['type', 'visibility'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_closure',
        index: 'room_closure_descendant_id_idx_c65fc595',
        columns: ['descendant_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_event',
        index: 'room_event_room_id_created_at_idx_3f0ddf95',
        columns: ['room_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_member_permission',
        index: 'room_member_permission_node_id_idx_c068255a',
        columns: ['node_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'room_permission_override',
        index: 'room_permission_override_node_id_idx_c068255a',
        columns: ['node_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'room',
        foreignKey: {
          name: 'room_parent_id_fkey',
          columns: ['parent_id'],
          references: { schema: 'public', table: 'room', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
