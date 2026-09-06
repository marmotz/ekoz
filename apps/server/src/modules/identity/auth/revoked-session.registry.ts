import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';

/**
 * In-memory denylist of revoked session ids (technical.md §7, ADR 0008).
 *
 * An access token stays cryptographically valid until it expires; the guard
 * consults this set to reject tokens whose session was revoked in the meantime.
 * Entries are only useful for `access_token_ttl` (after that every token
 * carrying the `sid` has expired anyway), so they self-expire on that window.
 *
 * Single-instance only — it becomes a Redis concern with the SSE backplane.
 */
@Injectable()
export class RevokedSessionRegistry implements OnModuleInit {
  private readonly logger = new Logger(RevokedSessionRegistry.name);
  /** `sid` → epoch-ms after which the entry can be dropped. */
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Warm the set from sessions revoked within the retention window. */
  async onModuleInit(): Promise<void> {
    const ttlMs = this.config.get('auth.access_token_ttl') * 1000;
    const cutoff = new Date(Date.now() - ttlMs).toISOString();
    const rows = (await this.prisma.orm.public.Session.where((s) => s.revokedAt.isNotNull())
      .where((s) => s.revokedAt.gt(cutoff))
      .all()) as Array<{ id: string; revokedAt: string }>;

    for (const row of rows) {
      this.entries.set(row.id, Date.parse(row.revokedAt) + ttlMs);
    }

    if (rows.length > 0) {
      this.logger.log(`Loaded ${rows.length} revoked session id(s) into the denylist`);
    }
  }

  /** Mark `sid` revoked for the retention window. */
  revoke(sid: string): void {
    const ttlMs = this.config.get('auth.access_token_ttl') * 1000;
    this.entries.set(sid, Date.now() + ttlMs);
  }

  /** `true` while `sid` is on the denylist. Prunes expired entries in passing. */
  isRevoked(sid: string): boolean {
    const expiry = this.entries.get(sid);
    if (expiry === undefined) {
      return false;
    }

    if (expiry <= Date.now()) {
      this.entries.delete(sid);

      return false;
    }

    return true;
  }
}
