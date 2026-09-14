import { DomainError } from './domain-error.js';

/**
 * Generic authentication/authorization problem+json errors (core/http, moved
 * here from the identity feature so {@link AuthGuard} and {@link OwnerGuard}
 * do not depend on a feature module — see
 * `docs/technical/shared-auth-guard.md`).
 */

export class UnauthenticatedError extends DomainError {
  constructor(detail = 'Authentication is required.') {
    super('auth.unauthenticated', detail, 401, 'Unauthorized');
  }
}

export class ForbiddenError extends DomainError {
  constructor(detail = 'You are not allowed to perform this action.') {
    super('auth.forbidden', detail, 403, 'Forbidden');
  }
}
