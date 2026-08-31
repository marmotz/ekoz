import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ForbiddenError, UnauthenticatedError } from '../identity.errors.js';
import type { AuthenticatedRequest } from './auth.guard.js';

/**
 * Restricts a route to server owners (technical.md §15, §16). Runs after
 * {@link AuthGuard}, so the principal is already attached; use them together
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
