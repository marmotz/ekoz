import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthenticatedError } from './auth.errors.js';
import {
  type AuthenticatedRequest,
  PRINCIPAL_AUTHENTICATOR,
  type PrincipalAuthenticator,
} from './principal-authenticator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { setAuthenticatedPrincipal } from './request-context.js';

export type { AuthenticatedRequest, AuthPrincipal } from './principal-authenticator.js';

/**
 * Generic authentication guard (`docs/technical/shared-auth-guard.md`).
 *
 * Skips `@Public()` routes. Otherwise extracts the bearer token and delegates
 * its verification to the bound {@link PrincipalAuthenticator} (the identity
 * feature's implementation), then populates the request principal and the
 * ambient request context.
 *
 * Not applied globally: opt in per controller with `@UseGuards(AuthGuard)`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRINCIPAL_AUTHENTICATOR) private readonly authenticator: PrincipalAuthenticator,
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

    const principal = await this.authenticator.authenticate(token);

    request.principal = principal;
    setAuthenticatedPrincipal({ userId: principal.userId, sessionId: principal.sessionId });

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
