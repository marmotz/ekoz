import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { sha256Hex } from '../../../core/crypto/hashing.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { AccountTx } from '../accounts/account.service.js';
import { InvitationInvalidError, InvitationNotFoundError } from '../identity.errors.js';

interface InvitationRow {
  id: string;
  email: string | null;
  tokenHash: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Client-facing invitation shape (never exposes the token hash). */
export interface InvitationView {
  id: string;
  email: string | null;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
  status: InvitationStatus;
}

export interface CreatedInvitation {
  id: string;
  /** The opaque token — returned once, never stored in the clear. */
  token: string;
  /** Ready-to-share registration URL. */
  url: string;
}

/**
 * Registration invitations (technical.md §8, issue #15). Owners only for this
 * increment. The opaque token is shown once at creation; only its SHA-256 hash
 * is persisted.
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    createdByUserId: string,
    input: { email?: string | null; expiresInDays?: number | null },
  ): Promise<CreatedInvitation> {
    const token = randomBytes(32).toString('base64url');
    const email = input.email ? input.email.normalize('NFC').trim().toLowerCase() : null;
    const ttlSeconds =
      input.expiresInDays != null
        ? input.expiresInDays * 86_400
        : this.config.get('invitation.ttl');

    const row = (await this.prisma.orm.public.Invitation.create({
      email,
      tokenHash: sha256Hex(token),
      createdByUserId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      consumedAt: null,
      consumedByUserId: null,
    })) as InvitationRow;

    return {
      id: row.id,
      token,
      url: `${this.config.get('server.web_url')}/register?invite=${token}`,
    };
  }

  async list(): Promise<InvitationView[]> {
    const rows = (await this.prisma.orm.public.Invitation.all()) as InvitationRow[];

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => toView(row));
  }

  /** Revoke an unconsumed invitation (technical.md §8): consumed sentinel, no consumer. */
  async revoke(id: string): Promise<void> {
    const row = (await this.prisma.orm.public.Invitation.first({ id })) as InvitationRow | null;
    if (!row) {
      throw new InvitationNotFoundError();
    }

    if (row.consumedAt === null) {
      await this.prisma.orm.public.Invitation.where({ id }).update({
        consumedAt: new Date().toISOString(),
        consumedByUserId: null,
      });
    }
  }

  /**
   * Validate a presented token against `email` (technical.md §8): must be
   * unconsumed, unexpired and — if the invitation is address-bound — match.
   * Returns the row id for {@link markConsumed}.
   */
  async assertValid(token: string, email: string): Promise<string> {
    const row = (await this.prisma.orm.public.Invitation.where({
      tokenHash: sha256Hex(token),
    }).first()) as InvitationRow | null;

    if (!row || row.consumedAt !== null || Date.parse(row.expiresAt) <= Date.now()) {
      throw new InvitationInvalidError();
    }

    if (row.email !== null && row.email !== email.normalize('NFC').trim().toLowerCase()) {
      throw new InvitationInvalidError('This invitation is bound to a different email address.');
    }

    return row.id;
  }

  /** Mark an invitation consumed inside the registration transaction. */
  async markConsumed(tx: AccountTx, invitationId: string, userId: string): Promise<void> {
    await tx.orm.public.Invitation.where({ id: invitationId }).update({
      consumedAt: new Date().toISOString(),
      consumedByUserId: userId,
    });
  }
}

function toView(row: InvitationRow): InvitationView {
  return {
    id: row.id,
    email: row.email,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    consumedByUserId: row.consumedByUserId,
    status: statusOf(row),
  };
}

function statusOf(row: InvitationRow): InvitationStatus {
  if (row.consumedAt !== null) {
    return row.consumedByUserId !== null ? 'accepted' : 'revoked';
  }

  return Date.parse(row.expiresAt) <= Date.now() ? 'expired' : 'pending';
}
