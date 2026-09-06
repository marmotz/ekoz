import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../core/http/public.decorator.js';
import { setAuthenticatedPrincipal } from '../../../core/http/request-context.js';
import { AccountService } from '../accounts/account.service.js';
import { RevokedSessionRegistry } from '../auth/revoked-session.registry.js';
import { TokenService } from '../auth/token.service.js';
import { AccountSuspendedError, UnauthenticatedError } from '../identity.errors.js';

/** The authenticated principal, attached to the request by {@link AuthGuard}. */
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  isOwner: boolean;
}

/** Express request augmented with the principal. */
export interface AuthenticatedRequest extends Request {
  principal?: AuthPrincipal;
}

/**
 * Global authentication guard (technical.md §7, ADR 0008).
 *
 * Skips `@Public()` routes. Otherwise: verifies the bearer JWT, rejects a
 * revoked `sid` via the in-memory denylist, loads the account and requires
 * `status = active`, then populates the request principal and the ambient
 * request context.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly revoked: RevokedSessionRegistry,
    private readonly accounts: AccountService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthenticatedError();
    }

    const claims = await this.tokens.verifyAccessToken(token);

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

    request.principal = { userId: user.id, sessionId: claims.sid, isOwner: user.isOwner };
    setAuthenticatedPrincipal({ userId: user.id, sessionId: claims.sid });

    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, value] = header.split(' ');

  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : null;
}
