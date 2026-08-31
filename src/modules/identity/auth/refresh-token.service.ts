import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { sha256Hex } from '../../../core/crypto/hashing.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RefreshInvalidError, RefreshReuseError } from '../identity.errors.js';
import { SessionService } from './session.service.js';

/** Outcome of a successful rotation: the session to re-issue for, and the new token. */
export interface RotationResult {
  sessionId: string;
  refreshToken: string;
}

interface RefreshTokenRow {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}

/**
 * Opaque rotating refresh tokens (technical.md §7, ADR 0008).
 *
 * 32 random bytes, returned once, stored only as a SHA-256 hash. Each session
 * has exactly one usable token; `refresh` consumes it and mints its successor.
 * Presenting an already-used token is treated as theft: the whole session is
 * revoked and an audit entry is written.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService
  ) {}

  /** Mint the first token for a freshly created session. Returns the plaintext. */
  async issue(sessionId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.orm.public.RefreshToken.create({
      sessionId,
      tokenHash: sha256Hex(token),
      expiresAt: this.expiryIso(),
      usedAt: null,
      replacedById: null,
    });

    return token;
  }

  /**
   * Rotate `presented`: validate, detect reuse, consume the current token and
   * mint its successor.
   */
  async rotate(presented: string): Promise<RotationResult> {
    const hash = sha256Hex(presented);
    const row = (await this.prisma.orm.public.RefreshToken.where({
      tokenHash: hash,
    }).first()) as RefreshTokenRow | null;

    if (!row || Date.parse(row.expiresAt) <= Date.now()) {
      throw new RefreshInvalidError();
    }

    if (row.usedAt !== null) {
      await this.sessions.revoke(row.sessionId, 'refresh_reuse_detected');
      await this.audit.record({
        action: 'auth.refresh_reuse_detected',
        targetType: 'session',
        targetId: row.sessionId,
      });

      throw new RefreshReuseError();
    }

    const next = randomBytes(32).toString('base64url');
    const created = (await this.prisma.orm.public.RefreshToken.create({
      sessionId: row.sessionId,
      tokenHash: sha256Hex(next),
      expiresAt: this.expiryIso(),
      usedAt: null,
      replacedById: null,
    })) as { id: string };

    await this.prisma.orm.public.RefreshToken.where({ id: row.id }).update({
      usedAt: new Date().toISOString(),
      replacedById: created.id,
    });

    return { sessionId: row.sessionId, refreshToken: next };
  }

  /** Burn every token of a session (logout, forced revocation). */
  async revokeForSession(sessionId: string): Promise<void> {
    const now = new Date().toISOString();
    const rows = (await this.prisma.orm.public.RefreshToken.where({ sessionId })
      .where((t) => t.usedAt.isNull())
      .all()) as RefreshTokenRow[];

    for (const row of rows) {
      await this.prisma.orm.public.RefreshToken.where({ id: row.id }).update({ usedAt: now });
    }
  }

  private expiryIso(): string {
    return new Date(Date.now() + this.config.get('auth.refresh_token_ttl') * 1000).toISOString();
  }
}
