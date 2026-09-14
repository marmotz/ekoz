import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { sha256Hex } from '../../../core/crypto/hashing.js';
import { MailService } from '../../../core/mail/mail.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { SessionService } from '../auth/session.service.js';
import {
  AccountDeletedError,
  PasswordResetInvalidError,
  UserNotFoundError,
} from '../identity.errors.js';
import { AccountService, type UserRecord } from './account.service.js';
import { PasswordService } from './password.service.js';
import { PASSWORD_RESET_TEMPLATE } from './templates.js';

interface PasswordResetRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
}

/**
 * Password reset (technical.md §10, issue #17).
 *
 * `request` never reveals whether an account exists; `confirm` sets the new
 * hash, revokes every session of the user and writes an `auth.password_reset`
 * audit entry.
 */
@Injectable()
export class PasswordResetService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.mail.registerTemplate('password-reset', PASSWORD_RESET_TEMPLATE);
  }

  /**
   * Start a reset (technical.md §10). Always resolves — the caller returns
   * `202` regardless — and only issues a token + mail for an existing active
   * account.
   */
  async request(email: string, requestedIp: string | null): Promise<void> {
    const user = await this.accounts.findByEmail(email);
    if (user?.status !== 'active' || user.email === null) {
      return;
    }

    await this.issueFor(user, requestedIp);
  }

  /**
   * Owner-triggered reset (technical.md §2.3, issue #14): same token and mail
   * as the public {@link request}, but keyed by user id, allowed for a
   * suspended account too, and audited as `identity.password_reset_triggered`.
   */
  async requestForUser(userId: string, actorUserId: string): Promise<void> {
    const user = await this.accounts.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    if (user.status === 'deleted' || user.email === null) {
      throw new AccountDeletedError();
    }

    await this.issueFor(user, null);

    await this.audit.record({
      action: 'identity.password_reset_triggered',
      actorUserId,
      targetType: 'user',
      targetId: userId,
    });
  }

  private async issueFor(user: UserRecord, requestedIp: string | null): Promise<void> {
    if (user.email === null) {
      return;
    }

    const stale = (await this.prisma.orm.public.PasswordReset.where({ userId: user.id })
      .where((r) => r.consumedAt.isNull())
      .all()) as Array<{ id: string }>;
    for (const row of stale) {
      await this.prisma.orm.public.PasswordReset.where({ id: row.id }).delete();
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.orm.public.PasswordReset.create({
      userId: user.id,
      tokenHash: sha256Hex(token),
      requestedIp,
      expiresAt: this.expiryIso(),
      consumedAt: null,
    });

    await this.mail.send({
      to: user.email,
      template: 'password-reset',
      category: 'identity',
      vars: {
        displayName: await this.accounts.displayNameOf(user.id),
        resetUrl: `${this.config.get('server.web_url')}/reset-password?token=${token}`,
      },
    });
  }

  /**
   * Consume a reset token and set the new password (technical.md §10). Every
   * session of the account is revoked.
   */
  async confirm(token: string, newPassword: string): Promise<void> {
    const row = (await this.prisma.orm.public.PasswordReset.where({
      tokenHash: sha256Hex(token),
    }).first()) as PasswordResetRow | null;

    if (!row || row.consumedAt !== null || Date.parse(row.expiresAt) <= Date.now()) {
      throw new PasswordResetInvalidError();
    }

    const user = await this.accounts.findById(row.userId);
    if (user?.status !== 'active') {
      throw new PasswordResetInvalidError();
    }

    this.passwords.assertAcceptable(newPassword);

    await this.accounts.updatePasswordHash(user.id, await this.passwords.hash(newPassword));
    await this.prisma.orm.public.PasswordReset.where({ id: row.id }).update({
      consumedAt: new Date().toISOString(),
    });

    for (const session of await this.sessions.listForUser(user.id)) {
      if (session.revokedAt === null) {
        await this.sessions.revoke(session.id, 'password_reset');
        await this.refreshTokens.revokeForSession(session.id);
      }
    }

    await this.audit.record({
      action: 'auth.password_reset',
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
    });
  }

  private expiryIso(): string {
    return new Date(Date.now() + this.config.get('auth.password_reset_ttl') * 1000).toISOString();
  }
}
