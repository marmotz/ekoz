#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/d6f52128cefcb5f2e2f4396cc55960f04719e893c0949abf1892bed75eb2814d/contract';
import endContract from '../../snapshots/d6f52128cefcb5f2e2f4396cc55960f04719e893c0949abf1892bed75eb2814d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e4c3c78ae597e16464785433712e04b567897ded5739b455077d12d994110eba/contract';
import startContract from '../../snapshots/e4c3c78ae597e16464785433712e04b567897ded5739b455077d12d994110eba/contract.json' with { type: 'json' };
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
        table: 'refresh_token',
        columns: [
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
          col('replaced_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('session_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('used_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'reserved_username',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reserved_until', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['name'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'session',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('device_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_seen_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('revoked_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('revoked_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email_verified_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('is_owner', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('password_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('suspended_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('suspended_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'user_status_check_8984e5f5',
            "\"status\" IN ('active', 'suspended', 'deleted')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user_profile',
        columns: [
          col('avatar_blob_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('display_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['user_id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'refresh_token',
        constraint: 'refresh_token_token_hash_key',
        columns: ['token_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_token',
        index: 'refresh_token_session_id_idx_00ba47bf',
        columns: ['session_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reserved_username',
        index: 'reserved_username_reserved_until_idx_d760ef60',
        columns: ['reserved_until'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'session',
        index: 'session_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'refresh_token',
        foreignKey: {
          name: 'refresh_token_session_id_fkey',
          columns: ['session_id'],
          references: { schema: 'public', table: 'session', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'session',
        foreignKey: {
          name: 'session_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_profile',
        foreignKey: {
          name: 'user_profile_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
