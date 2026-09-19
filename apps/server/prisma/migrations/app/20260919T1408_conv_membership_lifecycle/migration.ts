#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/19215e056f2aba61741c3158ed53b6f13c276f4cb311b2d6dc8a0ef5567549c6/contract';
import startContract from '../../snapshots/19215e056f2aba61741c3158ed53b6f13c276f4cb311b2d6dc8a0ef5567549c6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5c311d3780a0eac35bc475f7a85aae0e9b8d707407fe466f7e0e5fcfa76f33c6/contract';
import endContract from '../../snapshots/5c311d3780a0eac35bc475f7a85aae0e9b8d707407fe466f7e0e5fcfa76f33c6/contract.json' with { type: 'json' };
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
        table: 'membership',
        columns: [
          col('invited_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('joined_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['room_id', 'user_id']),
          checkExpression(
            'membership_role_check_9fefc26a',
            "\"role\" IN ('space_admin', 'room_admin', 'moderator', 'member', 'reader')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_ban',
        columns: [
          col('banned_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('banned_by_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['room_id', 'user_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_invitation',
        columns: [
          col('accepted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('declined_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('expires_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('invited_by_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('member'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'room_invitation_role_check_9fefc26a',
            "\"role\" IN ('space_admin', 'room_admin', 'moderator', 'member', 'reader')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'room_join_request',
        columns: [
          col('approved', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolved_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('resolved_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('room_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room_invitation',
        constraint: 'room_invitation_room_id_user_id_key',
        columns: ['room_id', 'user_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room_join_request',
        constraint: 'room_join_request_room_id_user_id_key',
        columns: ['room_id', 'user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'membership',
        index: 'membership_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
