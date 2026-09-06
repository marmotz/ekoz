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

export class WeakPasswordError extends DomainError {
  constructor(detail = 'The password does not meet the minimum policy.') {
    super('identity.password_too_weak', detail, 422, 'Unprocessable Entity');
  }
}

export class RegistrationClosedError extends DomainError {
  constructor(detail = 'Self-service registration is disabled on this server.') {
    super('identity.registration_closed', detail, 403, 'Forbidden');
  }
}

export class InvitationInvalidError extends DomainError {
  constructor(detail = 'The invitation is invalid, expired or already used.') {
    super('identity.invitation_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class InvitationNotFoundError extends DomainError {
  constructor(detail = 'Invitation not found.') {
    super('identity.invitation_not_found', detail, 404, 'Not Found');
  }
}

export class EmailVerificationInvalidError extends DomainError {
  constructor(detail = 'The verification link is invalid or has expired.') {
    super('identity.email_verification_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class EmailAlreadyInUseError extends DomainError {
  constructor(detail = 'This email address is already in use.') {
    super('identity.email_taken', detail, 409, 'Conflict');
  }
}

export class SetupRejectedError extends DomainError {
  constructor(detail = 'The setup credentials were rejected.') {
    super('identity.setup_rejected', detail, 403, 'Forbidden');
  }
}

export class PasswordResetInvalidError extends DomainError {
  constructor(detail = 'The password reset link is invalid or has expired.') {
    super('auth.password_reset_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class UserNotFoundError extends DomainError {
  constructor(detail = 'No such user.') {
    super('identity.user_not_found', detail, 404, 'Not Found');
  }
}

export class ProfileNotFoundError extends DomainError {
  constructor(detail = 'No such profile.') {
    super('identity.profile_not_found', detail, 404, 'Not Found');
  }
}

export class ProfileInvalidError extends DomainError {
  constructor(detail = 'The profile update is invalid.') {
    super('identity.profile_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class AvatarRejectedError extends DomainError {
  constructor(detail = 'The uploaded file is not an accepted avatar image.') {
    super('identity.avatar_rejected', detail, 422, 'Unprocessable Entity');
  }
}

export class AvatarTooLargeError extends DomainError {
  constructor(detail = 'The uploaded file exceeds the maximum avatar size.') {
    super('identity.avatar_too_large', detail, 413, 'Payload Too Large');
  }
}

export class AvatarNotFoundError extends DomainError {
  constructor(detail = 'This user has no avatar.') {
    super('identity.avatar_not_found', detail, 404, 'Not Found');
  }
}

export class UsernameImmutableError extends DomainError {
  constructor(detail = 'Identifiers cannot be changed on this server.') {
    super('identity.username_immutable', detail, 403, 'Forbidden');
  }
}

export class UsernameChangeCooldownError extends DomainError {
  constructor(detail = 'You changed your identifier too recently; try again later.') {
    super('identity.username_change_cooldown', detail, 409, 'Conflict');
  }
}

export class UsernameChangeRequestNotFoundError extends DomainError {
  constructor(detail = 'No such identifier change request.') {
    super('identity.username_request_not_found', detail, 404, 'Not Found');
  }
}

export class UsernameChangeRequestResolvedError extends DomainError {
  constructor(detail = 'This identifier change request has already been resolved.') {
    super('identity.username_request_resolved', detail, 409, 'Conflict');
  }
}

export class LastOwnerError extends DomainError {
  constructor(detail = 'The server must keep at least one owner.') {
    super('identity.last_owner', detail, 409, 'Conflict');
  }
}

export class TooManyRequestsError extends DomainError {
  constructor(retryAfterSeconds: number, detail = 'Too many requests; slow down and retry later.') {
    super('auth.too_many_requests', detail, 429, 'Too Many Requests', {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    });
  }
}
