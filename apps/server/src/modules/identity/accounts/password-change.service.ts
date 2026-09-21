import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import type { AuthPrincipal } from '../../../core/http/auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import {
  InvalidCredentialsError,
  UserNotFoundError,
  WeakPasswordError,
} from '../identity.errors.js';
import { AccountService } from './account.service.js';
import { PasswordService } from './password.service.js';

/**
 * Password change for a signed-in account. Re-authenticates with the current
 * password, applies the same policy as registration, then revokes every other
 * session so a stolen session cannot outlive the change; the calling session
 * stays open.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async change(
    principal: AuthPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.accounts.findById(principal.userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new InvalidCredentialsError();
    }

    this.passwords.assertAcceptable(newPassword);
    if (newPassword === currentPassword) {
      throw new WeakPasswordError('The new password must differ from the current one.');
    }

    await this.accounts.updatePasswordHash(user.id, await this.passwords.hash(newPassword));

    const revokedSessions = await this.sessions.revokeAllForUser(user.id, {
      exceptSessionId: principal.sessionId,
      reason: 'password_changed',
    });

    await this.audit.record({
      action: 'auth.password_changed',
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { revokedSessions },
    });
  }
}
