import { EkozError, NetworkError, RateLimitError, ValidationError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';

/** A message to show: an i18n key (with its values), or text that came from the server. */
export type AuthMessage = { key: ParseKeys; values?: Record<string, number> } | { text: string };

export interface MappedAuthError {
  /** Stable error code, `unknown` for anything that is not an SDK error. */
  code: string;
  /** Message for the form as a whole. */
  form?: AuthMessage;
  /** Messages for single fields, keyed by the request body field name. */
  fields: { field: string; message: AuthMessage }[];
}

type Placement =
  | { scope: 'form'; key: ParseKeys }
  | { scope: 'field'; field: string; key: ParseKeys };

/**
 * Where each server error code is shown (technical.md C3). Errors are mapped by `code`
 * rather than by SDK class: not every code has a class (`identity.identifier_invalid`
 * falls back to `EkozError`). Field names are those of the request bodies
 * (`RegisterDto`, ...); `useAuthError` falls back to a form-level message when the
 * form has no such field.
 */
export const AUTH_ERROR_TABLE: Record<string, Placement> = {
  'auth.invalid_credentials': { scope: 'form', key: 'auth.errors.invalidCredentials' },
  'identity.account_suspended': { scope: 'form', key: 'auth.errors.accountSuspended' },
  'identity.email_not_verified': { scope: 'form', key: 'auth.errors.emailNotVerified' },
  'identity.registration_closed': { scope: 'form', key: 'auth.errors.registrationClosed' },
  'identity.invitation_invalid': {
    scope: 'field',
    field: 'invitationToken',
    key: 'auth.errors.invitationInvalid',
  },
  'identity.email_taken': { scope: 'field', field: 'email', key: 'auth.errors.emailTaken' },
  'identity.identifier_invalid': {
    scope: 'field',
    field: 'name',
    key: 'auth.errors.identifierInvalid',
  },
  'identity.password_too_weak': {
    scope: 'field',
    field: 'password',
    key: 'auth.errors.passwordTooWeak',
  },
  'identity.email_verification_invalid': {
    scope: 'form',
    key: 'auth.errors.emailVerificationInvalid',
  },
  'auth.password_reset_invalid': { scope: 'form', key: 'auth.errors.passwordResetInvalid' },
};

const RATE_LIMIT_CODE = 'auth.too_many_requests';

function rateLimitMessage(error: RateLimitError): AuthMessage {
  return error.retryAfter === undefined
    ? { key: 'auth.errors.tooManyRequestsLater' }
    : { key: 'auth.errors.tooManyRequests', values: { count: Math.ceil(error.retryAfter) } };
}

/** Turns an error thrown by an SDK call into where and what to show. */
export function mapAuthError(error: unknown): MappedAuthError {
  if (error instanceof RateLimitError) {
    return { code: RATE_LIMIT_CODE, form: rateLimitMessage(error), fields: [] };
  }
  if (error instanceof ValidationError && error.issues.length > 0) {
    return {
      code: error.code,
      fields: error.issues.map((issue) => ({
        field: issue.path,
        message: { text: issue.message },
      })),
    };
  }
  if (error instanceof EkozError) {
    const placement = AUTH_ERROR_TABLE[error.code];
    if (placement?.scope === 'form') {
      return { code: error.code, form: { key: placement.key }, fields: [] };
    }
    if (placement?.scope === 'field') {
      return {
        code: error.code,
        fields: [{ field: placement.field, message: { key: placement.key } }],
      };
    }
    if (error instanceof NetworkError) {
      return { code: error.code, form: { key: 'auth.errors.network' }, fields: [] };
    }
    return { code: error.code, form: { key: 'auth.errors.generic' }, fields: [] };
  }
  return { code: 'unknown', form: { key: 'auth.errors.generic' }, fields: [] };
}

/**
 * Message for a schema issue reported by the generated Zod schemas. The issues are
 * Zod's own (`code`, `origin`, `minimum`, ...); they are translated instead of showing
 * Zod's English text. A custom message (a refinement written at the call site) is kept.
 */
export function validationMessage(issue: unknown): AuthMessage {
  if (typeof issue === 'string') return { text: issue };
  if (typeof issue !== 'object' || issue === null) return { key: 'auth.errors.invalid' };

  const { code, origin, minimum, maximum, format, message } = issue as {
    code?: string;
    origin?: string;
    minimum?: number;
    maximum?: number;
    format?: string;
    message?: string;
  };

  if (code === 'too_small' && origin === 'string') {
    return minimum !== undefined && minimum > 1
      ? { key: 'auth.errors.tooShort', values: { count: minimum } }
      : { key: 'auth.errors.required' };
  }
  if (code === 'too_big' && origin === 'string' && maximum !== undefined) {
    return { key: 'auth.errors.tooLong', values: { count: maximum } };
  }
  if (code === 'invalid_format' && format === 'email') return { key: 'auth.errors.invalidEmail' };
  if (code === 'invalid_type') return { key: 'auth.errors.required' };
  return message ? { text: message } : { key: 'auth.errors.invalid' };
}
