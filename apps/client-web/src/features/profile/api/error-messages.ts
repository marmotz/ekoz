import { EkozError, NetworkError, RateLimitError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';

import type { Message } from '@/shared/i18n/validation-message';

export interface MappedAccountError {
  /** Stable error code, `unknown` for anything that is not an SDK error. */
  code: string;
  message: Message;
}

/** `EkozError.code` to the translation key of its message (technical.md 24, "Errors and strings"). */
export const ACCOUNT_ERROR_TABLE: Record<string, ParseKeys> = {
  'auth.invalid_credentials': 'account.errors.invalidCredentials',
  'identity.password_too_weak': 'account.errors.passwordTooWeak',
  'identity.email_taken': 'account.errors.emailTaken',
  'identity.identifier_invalid': 'account.errors.identifierInvalid',
  'identity.username_taken': 'account.errors.usernameTaken',
  'identity.username_immutable': 'account.errors.usernameImmutable',
  'identity.username_change_cooldown': 'account.errors.usernameChangeCooldown',
  'identity.username_request_pending': 'account.errors.usernameRequestPending',
  'identity.profile_invalid': 'account.errors.profileInvalid',
  'identity.avatar_too_large': 'account.errors.avatarTooLarge',
  'identity.avatar_rejected': 'account.errors.avatarRejected',
  'identity.last_owner': 'account.errors.lastOwner',
};

const RATE_LIMIT_CODE = 'auth.too_many_requests';

/** Turns an error thrown by an SDK call into the message to show. */
export function mapAccountError(error: unknown): MappedAccountError {
  if (error instanceof RateLimitError) {
    return {
      code: RATE_LIMIT_CODE,
      message:
        error.retryAfter === undefined
          ? { key: 'account.errors.tooManyRequestsLater' }
          : {
              key: 'account.errors.tooManyRequests',
              values: { count: Math.ceil(error.retryAfter) },
            },
    };
  }
  if (error instanceof NetworkError) {
    return { code: error.code, message: { key: 'account.errors.network' } };
  }
  if (error instanceof EkozError) {
    const key = ACCOUNT_ERROR_TABLE[error.code];
    return { code: error.code, message: { key: key ?? 'account.errors.generic' } };
  }
  return { code: 'unknown', message: { key: 'account.errors.generic' } };
}
