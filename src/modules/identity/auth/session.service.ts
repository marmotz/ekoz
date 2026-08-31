import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { SessionNotFoundError } from '../identity.errors.js';
import { deriveDeviceName } from './device-name.js';
import { RevokedSessionRegistry } from './revoked-session.registry.js';

export interface SessionRecord {
  id: string;
  userId: string;
  deviceName: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface CreateSessionInput {
  userId: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Named multi-device sessions (technical.md §11, ADR 0008). Creation enforces
 * `auth.max_sessions_per_user` by evicting the oldest active session; every
 * revocation path also adds the `sid` to the in-memory denylist.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly revoked: RevokedSessionRegistry
  ) {}

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    await this.evictOverflow(input.userId);

    const now = new Date().toISOString();
    const deviceName = input.deviceName?.trim() || deriveDeviceName(input.userAgent);

    const row = (await this.prisma.orm.public.Session.create({
      userId: input.userId,
      deviceName,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      lastSeenAt: now,
      revokedAt: null,
    })) as SessionRow;

    return toRecord(row);
  }

  /** An active (non-revoked) session by id, or `null`. */
  async getActive(sessionId: string): Promise<SessionRecord | null> {
    const row = (await this.prisma.orm.public.Session.first({ id: sessionId })) as SessionRow | null;
    if (!row || row.revokedAt !== null) {
      return null;
    }

    return toRecord(row);
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.orm.public.Session.where({ id: sessionId }).update({
      lastSeenAt: new Date().toISOString(),
    });
  }

  /** Every session of `userId`, newest first. */
  async listForUser(userId: string): Promise<SessionRecord[]> {
    const rows = (await this.prisma.orm.public.Session.where({ userId })
      .orderBy((s) => s.createdAt.desc())
      .all()) as SessionRow[];

    return rows.map(toRecord);
  }

  async rename(userId: string, sessionId: string, deviceName: string): Promise<SessionRecord> {
    await this.assertOwned(userId, sessionId);
    await this.prisma.orm.public.Session.where({ id: sessionId }).update({ deviceName });

    const row = (await this.prisma.orm.public.Session.first({ id: sessionId })) as SessionRow;

    return toRecord(row);
  }

  /** Revoke one session (idempotent). Adds the `sid` to the denylist. */
  async revoke(sessionId: string, reason = 'user_revoked'): Promise<void> {
    const row = (await this.prisma.orm.public.Session.first({ id: sessionId })) as SessionRow | null;
    if (!row) {
      return;
    }

    if (row.revokedAt === null) {
      await this.prisma.orm.public.Session.where({ id: sessionId }).update({
        revokedAt: new Date().toISOString(),
        revokedReason: reason,
      });
    }

    this.revoked.revoke(sessionId);
  }

  async revokeOwned(userId: string, sessionId: string, reason?: string): Promise<void> {
    await this.assertOwned(userId, sessionId);
    await this.revoke(sessionId, reason);
  }

  /** Revoke every active session of `userId`, optionally sparing `exceptSessionId`. */
  async revokeAllForUser(userId: string, options: { exceptSessionId?: string; reason?: string } = {}): Promise<number> {
    const rows = (await this.prisma.orm.public.Session.where({ userId })
      .where((s) => s.revokedAt.isNull())
      .all()) as SessionRow[];

    let count = 0;
    for (const row of rows) {
      if (row.id === options.exceptSessionId) {
        continue;
      }

      await this.revoke(row.id, options.reason ?? 'user_revoked_all');
      count += 1;
    }

    return count;
  }

  private async assertOwned(userId: string, sessionId: string): Promise<void> {
    const row = (await this.prisma.orm.public.Session.first({ id: sessionId })) as SessionRow | null;
    if (!row || row.userId !== userId) {
      throw new SessionNotFoundError();
    }
  }

  private async evictOverflow(userId: string): Promise<void> {
    const max = this.config.get('auth.max_sessions_per_user');
    const active = (await this.prisma.orm.public.Session.where({ userId })
      .where((s) => s.revokedAt.isNull())
      .orderBy((s) => s.createdAt.asc())
      .all()) as SessionRow[];

    const overflow = active.length - (max - 1);
    for (let i = 0; i < overflow; i += 1) {
      await this.revoke(active[i]!.id, 'max_sessions_exceeded');
    }
  }
}

interface SessionRow {
  id: string;
  userId: string;
  deviceName: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    deviceName: row.deviceName,
    userAgent: row.userAgent,
    ip: row.ip,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
  };
}
