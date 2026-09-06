import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { hashesEqual, sha256Hex } from '../crypto/hashing.js';
import { DomainError } from '../http/domain-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NoOwnerLookup, OWNER_LOOKUP, type OwnerLookup } from './owner-lookup.js';

/**
 * Setup state (technical.md §5, ADR 0010):
 * - `closed`       — an owner exists; `/setup/*` is `410 Gone` forever.
 * - `email-pinned` — `EKOZ_INITIAL_OWNER_EMAIL` is set; only that address may
 *                    claim ownership.
 * - `token-pinned` — otherwise; a single-use token (printed to stdout once)
 *                    must accompany the claim.
 */
export type SetupState = 'closed' | 'email-pinned' | 'token-pinned';

/** DI token for a `process.env` stand-in (tests inject a fake; production omits it). */
export const SETUP_ENV = Symbol('SETUP_ENV');

interface SetupTokenRow {
  id: string;
  tokenHash: string;
  consumedAt: string | null;
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() @Inject(OWNER_LOOKUP) private readonly ownerLookup: OwnerLookup = new NoOwnerLookup(),
    @Optional() @Inject(SETUP_ENV) private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  /** The address pinned by `EKOZ_INITIAL_OWNER_EMAIL`, lower-cased, or `null`. */
  pinnedOwnerEmail(): string | null {
    const raw = this.env['EKOZ_INITIAL_OWNER_EMAIL']?.trim().toLowerCase();

    return raw ? raw : null;
  }

  async resolveState(): Promise<SetupState> {
    if (await this.ownerLookup.ownerExists()) {
      return 'closed';
    }

    return this.pinnedOwnerEmail() ? 'email-pinned' : 'token-pinned';
  }

  /**
   * On every boot, while setup is token-pinned and open, rotate the setup token:
   * drop any earlier unconsumed token, generate a fresh single-use one, store
   * its hash and print the plaintext to stdout (`warn`). The plaintext only ever
   * exists at generation time (the row keeps just the hash), so an operator who
   * missed the last boot's line simply restarts to get a working token.
   */
  async ensureSetupToken(): Promise<void> {
    if ((await this.resolveState()) !== 'token-pinned') {
      return;
    }

    const superseded = (await this.prisma.orm.public.SetupToken.where((t) =>
      t.consumedAt.isNull()
    ).all()) as SetupTokenRow[];
    for (const row of superseded) {
      await this.prisma.orm.public.SetupToken.where({ id: row.id }).delete();
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.orm.public.SetupToken.create({ tokenHash: sha256Hex(token), consumedAt: null });
    this.logger.warn(
      `Setup is open. Create the first owner with this single-use token:\n\n    ${token}\n\n` +
        'A fresh token is printed on every restart until the first owner exists. ' +
        'Set EKOZ_INITIAL_OWNER_EMAIL to use email pinning instead.'
    );
  }

  /** Throw `410 Gone` once an owner exists; otherwise return. */
  async assertOpen(): Promise<void> {
    if ((await this.resolveState()) === 'closed') {
      throw new DomainError('setup.closed', 'Server setup is already complete.', 410, 'Gone');
    }
  }

  /** `true` when `token` matches the stored, unconsumed setup token. */
  async isValidToken(token: string): Promise<boolean> {
    const row = await this.liveTokenRow();

    return row ? hashesEqual(sha256Hex(token), row.tokenHash) : false;
  }

  /**
   * Mark setup complete: consume the token (if token-pinned) and write the
   * `server.initialized` audit entry. Called by identity's `POST /setup/owner`
   * once the first `User` is created, inside its request.
   */
  async completeSetup(params: { ownerUserId: string; ownerEmail: string }): Promise<void> {
    const row = await this.liveTokenRow();
    if (row) {
      await this.prisma.orm.public.SetupToken.where({ id: row.id }).update({
        consumedAt: new Date().toISOString(),
      });
    }

    await this.audit.record({
      action: 'server.initialized',
      actorUserId: params.ownerUserId,
      targetType: 'user',
      targetId: params.ownerUserId,
      metadata: { ownerEmail: params.ownerEmail, pinning: this.pinnedOwnerEmail() ? 'email' : 'token' },
    });
    this.logger.log(`Server initialized: first owner ${params.ownerEmail} created`);
  }

  private async liveTokenRow(): Promise<SetupTokenRow | null> {
    return (await this.prisma.orm.public.SetupToken.where((t) => t.consumedAt.isNull())
      .orderBy((t) => t.createdAt.desc())
      .first()) as SetupTokenRow | null;
  }
}
