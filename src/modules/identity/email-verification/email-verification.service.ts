import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { sha256Hex } from '../../../core/crypto/hashing.js';
import { MailService } from '../../../core/mail/mail.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { AccountService } from '../accounts/account.service.js';
import { PasswordService } from '../accounts/password.service.js';
import { EmailAlreadyInUseError, EmailVerificationInvalidError, InvalidCredentialsError } from '../identity.errors.js';
import { EMAIL_CHANGED_NOTICE_TEMPLATE, EMAIL_VERIFICATION_TEMPLATE } from './templates.js';

interface EmailVerificationRow {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
}

/** Result of {@link EmailVerificationService.verify}. */
export interface VerifyResult {
  /** `true` when the address was already verified (still a `200`). */
  alreadyVerified: boolean;
}

/**
 * Email verification and email change (technical.md §9, issue #16).
 *
 * One model, {@link EmailVerificationRow}, backs both flows: the initial
 * verification after registration (`email` equals `User.email`) and an address
 * change (`email` is the pending new address, applied to `User.email` only when
 * the token is consumed).
 */
@Injectable()
export class EmailVerificationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService
  ) {}

  onModuleInit(): void {
    this.mail.registerTemplate('email-verification', EMAIL_VERIFICATION_TEMPLATE);
    this.mail.registerTemplate('email-changed-notice', EMAIL_CHANGED_NOTICE_TEMPLATE);
  }

  /**
   * Issue a fresh verification token for `userId` + `email` and send the
   * `email-verification` mail. Any earlier unconsumed token for the same user is
   * dropped. Used by registration, `resend`, and the email-change flow.
   */
  async startVerification(userId: string, email: string): Promise<void> {
    const stale = (await this.prisma.orm.public.EmailVerification.where({ userId })
      .where((v) => v.consumedAt.isNull())
      .all()) as Array<{ id: string }>;
    for (const row of stale) {
      await this.prisma.orm.public.EmailVerification.where({ id: row.id }).delete();
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.orm.public.EmailVerification.create({
      userId,
      email,
      tokenHash: sha256Hex(token),
      expiresAt: this.expiryIso(),
      consumedAt: null,
    });

    await this.mail.send({
      to: email,
      template: 'email-verification',
      category: 'identity',
      vars: {
        displayName: await this.displayName(userId),
        verifyUrl: `${this.config.get('server.web_url')}/verify-email?token=${token}`,
      },
    });
  }

  /** Consume a verification token (technical.md §9). Already-verified → `200`. */
  async verify(token: string): Promise<VerifyResult> {
    const row = (await this.prisma.orm.public.EmailVerification.where({
      tokenHash: sha256Hex(token),
    }).first()) as EmailVerificationRow | null;

    if (!row || row.consumedAt !== null || Date.parse(row.expiresAt) <= Date.now()) {
      throw new EmailVerificationInvalidError();
    }

    const user = await this.accounts.findById(row.userId);
    if (!user || user.status !== 'active') {
      throw new EmailVerificationInvalidError();
    }

    const isChange = row.email !== user.email;

    if (isChange) {
      const clash = await this.accounts.findByEmail(row.email);
      if (clash && clash.id !== user.id) {
        throw new EmailAlreadyInUseError();
      }
      await this.accounts.applyEmailChange(user.id, row.email);
    } else if (user.emailVerifiedAt === null) {
      await this.accounts.markEmailVerified(user.id);
    } else {
      await this.consume(row.id);

      return { alreadyVerified: true };
    }

    await this.consume(row.id);
    await this.audit.record({
      action: isChange ? 'identity.email_changed' : 'identity.email_verified',
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { email: row.email },
    });

    return { alreadyVerified: false };
  }

  /**
   * Resend a verification mail (technical.md §9). Always resolves — the caller
   * returns `202` regardless — and only sends for an existing, active, still
   * unverified account whose current address matches `email`.
   */
  async resend(email: string): Promise<void> {
    const user = await this.accounts.findByEmail(email);
    if (!user || user.status !== 'active' || user.emailVerifiedAt !== null || user.email === null) {
      return;
    }

    await this.startVerification(user.id, user.email);
  }

  /**
   * Request an email-address change (technical.md §9). Re-authenticates with the
   * password, sends verification to the new address and an `email-changed-notice`
   * to the current one. `User.email` is not touched until the token is consumed.
   */
  async requestEmailChange(userId: string, newEmail: string, password: string): Promise<void> {
    const user = await this.accounts.findById(userId);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new InvalidCredentialsError();
    }

    const normalized = newEmail.normalize('NFC').trim().toLowerCase();
    if (normalized === user.email) {
      return;
    }

    const clash = await this.accounts.findByEmail(normalized);
    if (clash && clash.id !== user.id) {
      throw new EmailAlreadyInUseError();
    }

    await this.startVerification(user.id, normalized);

    if (user.email) {
      await this.mail.send({
        to: user.email,
        template: 'email-changed-notice',
        category: 'identity',
        vars: { displayName: await this.displayName(user.id), newEmail: normalized },
      });
    }

    await this.audit.record({
      action: 'identity.email_change_requested',
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { newEmail: normalized },
    });
  }

  private async consume(id: string): Promise<void> {
    await this.prisma.orm.public.EmailVerification.where({ id }).update({
      consumedAt: new Date().toISOString(),
    });
  }

  private async displayName(userId: string): Promise<string> {
    const profile = (await this.prisma.orm.public.UserProfile.first({ userId })) as { displayName: string } | null;

    return profile?.displayName ?? 'there';
  }

  private expiryIso(): string {
    return new Date(Date.now() + this.config.get('email.verification_ttl') * 1000).toISOString();
  }
}
