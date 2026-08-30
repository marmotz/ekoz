import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ed25519Sign,
  ed25519Verify,
  generateEd25519KeyPair,
  privateKeyFromDer,
  publicKeyFromBase64,
} from './ed25519.js';
import { SecretBox } from './secret-box.js';

/** A signing key as the rest of the app consumes it (never exposes the private half). */
export interface ActiveSigningKey {
  id: string;
  algorithm: string;
  publicKey: string;
}

/** One published key in the discovery document (technical.md §4). */
export interface PublishedSigningKey {
  id: string;
  publicKey: string;
  /** ISO-8601, when the key became active. */
  validFrom: string;
  /** ISO-8601 end of the overlap window for a retired key; `null` while active. */
  validUntil: string | null;
}

/** Result of {@link SigningService.sign}. */
export interface Signature {
  keyId: string;
  algorithm: string;
  signature: Buffer;
}

interface SigningKeyRow {
  id: string;
  algorithm: string;
  publicKey: string;
  privateKeyEnc: Uint8Array;
  activatedAt: string | null;
  retiredAt: string | null;
}

/** Short random key id — published in `.well-known` and carried by every signature. */
function newKeyId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Server signing keys (technical.md §4, ADR 0006).
 *
 * Exactly one key is active at a time. Rotation inserts a new active key and
 * retires the previous one; a retired key stays published (and usable for
 * verification) until `retiredAt` + the overlap window
 * (`signing.key_overlap_seconds`, default 7d), after which {@link sweepRetiredKeys}
 * drops it. Private keys are sealed by {@link SecretBox} before storage.
 */
@Injectable()
export class SigningService implements OnModuleInit {
  private readonly logger = new Logger(SigningService.name);

  private secretBoxInstance: SecretBox | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() secretBox: SecretBox | null = null
  ) {
    this.secretBoxInstance = secretBox;
  }

  /**
   * The secret box, built lazily from `secret.key`. Deferred out of the
   * constructor so it is only read once `ConfigService` has loaded the layered
   * configuration (same constraint as `MetricsService`).
   */
  private get secretBox(): SecretBox {
    this.secretBoxInstance ??= SecretBox.fromBase64(this.config.get('secret.key'));

    return this.secretBoxInstance;
  }

  /** Ensure the server has an active key (technical.md §5, item 3). */
  async onModuleInit(): Promise<void> {
    await this.getActiveKey();
  }

  /** The active key, generating one on first use if none exists yet. */
  async getActiveKey(): Promise<ActiveSigningKey> {
    const existing = await this.findActiveRow();
    const row = existing ?? (await this.insertActiveKey());

    return { id: row.id, algorithm: row.algorithm, publicKey: row.publicKey };
  }

  /** Every currently published key, active first (technical.md §4 discovery doc). */
  async listPublicKeys(): Promise<PublishedSigningKey[]> {
    const overlapMs = this.config.get('signing.key_overlap_seconds') * 1000;
    const now = Date.now();
    const rows = (await this.prisma.orm.public.ServerSigningKey.where((k) =>
      k.activatedAt.isNotNull()
    ).all()) as SigningKeyRow[];

    return rows
      .map((row) => {
        const validUntil =
          row.retiredAt === null ? null : new Date(Date.parse(row.retiredAt) + overlapMs).toISOString();

        return { id: row.id, publicKey: row.publicKey, validFrom: row.activatedAt as string, validUntil };
      })
      .filter((key) => key.validUntil === null || Date.parse(key.validUntil) > now)
      .sort((a, b) => {
        if (a.validUntil === b.validUntil) return b.validFrom.localeCompare(a.validFrom);

        return a.validUntil === null ? -1 : b.validUntil === null ? 1 : 0;
      });
  }

  /** Sign `bytes` with the active key. */
  async sign(bytes: Uint8Array): Promise<Signature> {
    const row = await this.findActiveRow();
    const active = row ?? (await this.insertActiveKey());
    const privateKey = privateKeyFromDer(this.secretBox.open(active.privateKeyEnc));

    return { keyId: active.id, algorithm: active.algorithm, signature: ed25519Sign(privateKey, bytes) };
  }

  /** Verify `sig` over `bytes` against the key `keyId` (active or still-published). */
  async verify(keyId: string, bytes: Uint8Array, sig: Uint8Array): Promise<boolean> {
    const row = (await this.prisma.orm.public.ServerSigningKey.where({ id: keyId }).first()) as SigningKeyRow | null;
    if (!row) {
      return false;
    }

    return ed25519Verify(publicKeyFromBase64(row.publicKey), bytes, sig);
  }

  /**
   * Rotate: insert a new active key and retire the previous one. The old key
   * stays published for the overlap window so in-flight signatures still verify.
   */
  async rotate(): Promise<ActiveSigningKey> {
    const previous = await this.findActiveRow();
    const next = await this.insertActiveKey();
    if (previous) {
      await this.prisma.orm.public.ServerSigningKey.where({ id: previous.id }).update({
        retiredAt: new Date().toISOString(),
      });
      this.logger.log(`Rotated signing key ${previous.id} -> ${next.id}`);
    }

    return { id: next.id, algorithm: next.algorithm, publicKey: next.publicKey };
  }

  /** Drop retired keys whose overlap window has fully elapsed. Returns the count removed. */
  async sweepRetiredKeys(): Promise<number> {
    const overlapMs = this.config.get('signing.key_overlap_seconds') * 1000;
    const cutoff = new Date(Date.now() - overlapMs).toISOString();
    const stale = (await this.prisma.orm.public.ServerSigningKey.where((k) =>
      k.retiredAt.lt(cutoff)
    ).all()) as SigningKeyRow[];

    for (const row of stale) {
      await this.prisma.orm.public.ServerSigningKey.where({ id: row.id }).delete();
    }

    if (stale.length > 0) {
      this.logger.log(`Swept ${stale.length} expired signing key(s)`);
    }

    return stale.length;
  }

  private async findActiveRow(): Promise<SigningKeyRow | null> {
    return (await this.prisma.orm.public.ServerSigningKey.where((k) => k.activatedAt.isNotNull())
      .where((k) => k.retiredAt.isNull())
      .orderBy((k) => k.activatedAt.desc())
      .first()) as SigningKeyRow | null;
  }

  private async insertActiveKey(): Promise<SigningKeyRow> {
    const { publicKeyBase64, privateKeyDer } = generateEd25519KeyPair();
    const id = newKeyId();
    const row = (await this.prisma.orm.public.ServerSigningKey.create({
      id,
      algorithm: 'ed25519',
      publicKey: publicKeyBase64,
      privateKeyEnc: this.secretBox.seal(privateKeyDer),
      activatedAt: new Date().toISOString(),
      retiredAt: null,
    })) as SigningKeyRow;
    this.logger.log(`Generated server signing key ${id}`);

    return row;
  }
}
