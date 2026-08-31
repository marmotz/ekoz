import { DomainError } from '../../core/http/domain-error.js';

/**
 * Problem+json errors for the identity feature (technical.md §2). Codes are
 * namespaced `identity.*` (account / identifier concerns) or `auth.*` (tokens,
 * sessions, credentials). Services throw these; the global filter renders them.
 */

export class IdentifierInvalidError extends DomainError {
  constructor(detail = 'The identifier is not a valid username.') {
    super('identity.identifier_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class IdentifierUnavailableError extends DomainError {
  constructor(detail = 'This username is not available.') {
    super('identity.username_taken', detail, 409, 'Conflict');
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(detail = 'Invalid identifier or password.') {
    super('auth.invalid_credentials', detail, 401, 'Unauthorized');
  }
}

export class AccountSuspendedError extends DomainError {
  constructor(detail = 'This account is suspended.') {
    super('identity.account_suspended', detail, 403, 'Forbidden');
  }
}

export class EmailNotVerifiedError extends DomainError {
  constructor(detail = 'Verify your email address before signing in.') {
    super('identity.email_not_verified', detail, 403, 'Forbidden');
  }
}

export class RefreshInvalidError extends DomainError {
  constructor(detail = 'The refresh token is invalid or has expired.') {
    super('auth.refresh_invalid', detail, 401, 'Unauthorized');
  }
}

export class RefreshReuseError extends DomainError {
  constructor(detail = 'The refresh token was already used; the session has been revoked.') {
    super('auth.refresh_reuse', detail, 401, 'Unauthorized');
  }
}

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

export class SessionNotFoundError extends DomainError {
  constructor(detail = 'Session not found.') {
    super('identity.session_not_found', detail, 404, 'Not Found');
  }
}
