import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { AccountService } from '../accounts/account.service.js';
import { PasswordService } from '../accounts/password.service.js';
import {
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  RefreshInvalidError,
} from '../identity.errors.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { type SessionRecord, SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

export interface LoginInput {
  identifier: string;
  password: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime, seconds. */
  expiresIn: number;
}

export interface LoginResult extends TokenBundle {
  session: SessionRecord;
}

/**
 * Login / refresh / logout orchestration (technical.md §7, §11, ADR 0008).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.accounts.findByIdentifier(input.identifier);

    if (!user) {
      await this.passwords.dummyVerify();

      throw new InvalidCredentialsError();
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new InvalidCredentialsError();
    }

    if (user.status === 'suspended') {
      throw new AccountSuspendedError();
    }
    if (user.status === 'deleted') {
      throw new InvalidCredentialsError();
    }

    if (this.config.get('email.verification_required') && user.emailVerifiedAt === null) {
      throw new EmailNotVerifiedError();
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.accounts.updatePasswordHash(user.id, await this.passwords.hash(input.password));
    }

    const session = await this.sessions.createSession({
      userId: user.id,
      deviceName: input.deviceName,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    const bundle = await this.issueBundle(user.id, session.id);
    await this.audit.record({
      action: 'auth.login',
      actorUserId: user.id,
      targetType: 'session',
      targetId: session.id,
    });

    return { ...bundle, session };
  }

  async refresh(presented: string): Promise<TokenBundle> {
    const { sessionId, refreshToken } = await this.refreshTokens.rotate(presented);

    const session = await this.sessions.getActive(sessionId);
    if (!session) {
      throw new RefreshInvalidError();
    }

    const user = await this.accounts.findById(session.userId);
    if (!user || user.status !== 'active') {
      throw new RefreshInvalidError();
    }

    const access = await this.tokens.issueAccessToken({ userId: user.id, sessionId });
    await this.sessions.touch(sessionId);

    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    await this.refreshTokens.revokeForSession(sessionId);
    await this.audit.record({ action: 'auth.logout', targetType: 'session', targetId: sessionId });
  }

  private async issueBundle(userId: string, sessionId: string): Promise<TokenBundle> {
    const access = await this.tokens.issueAccessToken({ userId, sessionId });
    const refreshToken = await this.refreshTokens.issue(sessionId);

    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
  }
}
