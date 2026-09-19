import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthenticatedError } from './auth.errors.js';
import type { AuthenticatedRequest } from './principal-authenticator.js';

/**
 * Restricts a route to server owners. Runs after {@link AuthGuard}, so the
 * principal is already attached; use them together
 * (`@UseGuards(AuthGuard, OwnerGuard)`).
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new UnauthenticatedError();
    }

    if (!request.principal.isOwner) {
      throw new ForbiddenError('This action is restricted to server owners.');
    }

    return true;
  }
}
