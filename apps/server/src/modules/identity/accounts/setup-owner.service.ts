import { Injectable } from '@nestjs/common';
import { SetupService } from '../../../core/bootstrap/setup.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { SessionService } from '../auth/session.service.js';
import { toSessionView } from '../auth/session.view.js';
import { TokenService } from '../auth/token.service.js';
import { SetupRejectedError } from '../identity.errors.js';
import { AccountService } from './account.service.js';
import { toAccountView } from './account.view.js';
import { PasswordService } from './password.service.js';
import type { SetupOwnerBody, SetupOwnerResponse } from './setup.dto.js';

export interface SetupOwnerContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Shape defined once as `SetupOwnerResponseSchema` in
 * [`setup.dto.ts`](./setup.dto.ts).
 */
export type SetupOwnerResult = SetupOwnerResponse;

/**
 * First-owner setup (technical.md §1, ADR 0010, issue #18). Reachable only while
 * server-core's `SetupGuard` reports setup open; it validates the pinning rule
 * (email or token), creates the first owner account with a verified email and an
 * initial session, then hands control to `SetupService.completeSetup`, which
 * consumes the token and emits `server.initialized`. From then on `/setup/*` is
 * `410 Gone`.
 */
@Injectable()
export class SetupOwnerService {
  constructor(
    private readonly setup: SetupService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async createFirstOwner(
    body: SetupOwnerBody,
    context: SetupOwnerContext = {},
  ): Promise<SetupOwnerResult> {
    const email = body.email.normalize('NFC').trim().toLowerCase();
    await this.assertPinning(email, body.token);
    this.passwords.assertAcceptable(body.password);

    const account = await this.accounts.createAccount({
      name: body.name,
      email,
      password: body.password,
      displayName: body.displayName,
      isOwner: true,
      emailVerified: true,
    });

    const session = await this.sessions.createSession({
      userId: account.id,
      deviceName: null,
      userAgent: context.userAgent ?? null,
      ip: context.ip ?? null,
    });
    const access = await this.tokens.issueAccessToken({
      userId: account.id,
      sessionId: session.id,
    });
    const refreshToken = await this.refreshTokens.issue(session.id);

    await this.setup.completeSetup({ ownerUserId: account.id, ownerEmail: email });

    return {
      user: toAccountView(account, body.displayName, this.config.get('server.domain')),
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresIn,
      session: toSessionView(session, session.id),
    };
  }

  private async assertPinning(email: string, token: string | undefined): Promise<void> {
    const state = await this.setup.resolveState();

    if (state === 'email-pinned') {
      if (email !== this.setup.pinnedOwnerEmail()) {
        throw new SetupRejectedError('This email address is not the pinned initial-owner address.');
      }

      return;
    }

    // token-pinned
    if (!token || !(await this.setup.isValidToken(token))) {
      throw new SetupRejectedError('The setup token is missing or invalid.');
    }
  }
}
