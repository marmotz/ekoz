import { expect } from 'vitest';
import type { Db } from '../../prisma/db.js';

type OrmLike = Pick<Db, 'orm'>;

export interface AuditLogRow {
  id: string;
  at: string;
  actorUserId: string | null;
  actorIp: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
}

/**
 * Test helper for other features' integration specs: assert that exactly one
 * audit entry matching `action` (and optionally a subset of its fields) was
 * written. Returns the row for further assertions.
 */
export async function expectAuditEntry(
  db: OrmLike,
  action: string,
  match: Partial<Omit<AuditLogRow, 'id' | 'at'>> = {},
): Promise<AuditLogRow> {
  const rows = (await db.orm.public.AuditLog.where({ action }).all()) as AuditLogRow[];
  expect(rows, `expected exactly one audit entry for "${action}"`).toHaveLength(1);
  const row = rows[0]!;
  for (const [key, value] of Object.entries(match)) {
    expect(row[key as keyof AuditLogRow]).toEqual(value);
  }
  return row;
}

/** Assert no audit entry was written for `action`. */
export async function expectNoAuditEntry(db: OrmLike, action: string): Promise<void> {
  const rows = (await db.orm.public.AuditLog.where({ action }).all()) as AuditLogRow[];
  expect(rows, `expected no audit entry for "${action}"`).toHaveLength(0);
}
