import { Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../../../core/http/auth.errors.js';
import type {
  AuthPrincipal,
  PrincipalAuthenticator,
} from '../../../core/http/principal-authenticator.js';
import { AccountService } from '../accounts/account.service.js';
import { RevokedSessionRegistry } from '../auth/revoked-session.registry.js';
import { TokenService } from '../auth/token.service.js';
import { AccountSuspendedError } from '../identity.errors.js';

/**
 * Real {@link PrincipalAuthenticator} for `AuthGuard` (core/http), bound by
 * {@link PrincipalAuthenticatorModule} (technical.md §7, ADR 0008,
 * `docs/technical/shared-auth-guard.md`).
 *
 * Verifies the bearer JWT, rejects a revoked `sid` via the in-memory denylist,
 * loads the account and requires `status = active`.
 */
@Injectable()
export class IdentityPrincipalAuthenticator implements PrincipalAuthenticator {
  constructor(
    private readonly tokens: TokenService,
    private readonly revoked: RevokedSessionRegistry,
    private readonly accounts: AccountService,
  ) {}

  async authenticate(bearerToken: string): Promise<AuthPrincipal> {
    const claims = await this.tokens.verifyAccessToken(bearerToken);

    const user = await this.accounts.findById(claims.sub);
    if (!user || user.status === 'deleted') {
      throw new UnauthenticatedError('The account is not active.');
    }

    // Checked before the revoked-sid denylist: a suspension revokes every
    // session too, but the caller should still see `403 account_suspended`
    // rather than a generic `401` (technical.md §15).
    if (user.status === 'suspended') {
      throw new AccountSuspendedError('This account is suspended; contact a server owner.');
    }

    if (this.revoked.isRevoked(claims.sid)) {
      throw new UnauthenticatedError('The session has been revoked.');
    }

    return { userId: user.id, sessionId: claims.sid, isOwner: user.isOwner };
  }
}
