import { EkozError, NetworkError, RateLimitError, ServerError, ValidationError } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_TABLE, mapAuthError } from '@/features/auth/api/errors';

function ekozError(code: string, status = 422) {
  return new EkozError({ code, status });
}

describe('mapAuthError', () => {
  it.each([
    ['auth.invalid_credentials', 'auth.errors.invalidCredentials'],
    ['identity.account_suspended', 'auth.errors.accountSuspended'],
    ['identity.email_not_verified', 'auth.errors.emailNotVerified'],
    ['identity.registration_closed', 'auth.errors.registrationClosed'],
    ['identity.email_verification_invalid', 'auth.errors.emailVerificationInvalid'],
    ['auth.password_reset_invalid', 'auth.errors.passwordResetInvalid'],
  ])('shows %s on the form', (code, key) => {
    expect(mapAuthError(ekozError(code))).toEqual({ code, form: { key }, fields: [] });
  });

  it.each([
    ['identity.invitation_invalid', 'invitationToken', 'auth.errors.invitationInvalid'],
    ['identity.email_taken', 'email', 'auth.errors.emailTaken'],
    ['identity.identifier_invalid', 'name', 'auth.errors.identifierInvalid'],
    ['identity.password_too_weak', 'password', 'auth.errors.passwordTooWeak'],
  ])('shows %s on the %s field', (code, field, key) => {
    expect(mapAuthError(ekozError(code))).toEqual({
      code,
      fields: [{ field, message: { key } }],
    });
  });

  it('covers every code of the table', () => {
    expect(Object.keys(AUTH_ERROR_TABLE).sort()).toEqual(
      [
        'auth.invalid_credentials',
        'auth.password_reset_invalid',
        'identity.account_suspended',
        'identity.email_not_verified',
        'identity.email_taken',
        'identity.email_verification_invalid',
        'identity.identifier_invalid',
        'identity.invitation_invalid',
        'identity.password_too_weak',
        'identity.registration_closed',
      ].sort(),
    );
  });

  it('reports the seconds to wait after a rate limit', () => {
    const error = new RateLimitError({
      code: 'auth.too_many_requests',
      status: 429,
      retryAfter: 41,
    });

    expect(mapAuthError(error)).toEqual({
      code: 'auth.too_many_requests',
      form: { key: 'auth.errors.tooManyRequests', values: { count: 41 } },
      fields: [],
    });
  });

  it('rounds a fractional delay up', () => {
    const error = new RateLimitError({
      code: 'auth.too_many_requests',
      status: 429,
      retryAfter: 1.2,
    });

    expect(mapAuthError(error).form).toEqual({
      key: 'auth.errors.tooManyRequests',
      values: { count: 2 },
    });
  });

  it('has a message for a rate limit without a delay', () => {
    const error = new RateLimitError({ code: 'auth.too_many_requests', status: 429 });

    expect(mapAuthError(error).form).toEqual({ key: 'auth.errors.tooManyRequestsLater' });
  });

  it('places a 422 with issues on the field named by the path', () => {
    const error = new ValidationError({
      code: 'validation_failed',
      status: 422,
      issues: [
        { path: 'email', message: 'must be an email' },
        { path: 'name', message: 'too long' },
      ],
    });

    expect(mapAuthError(error)).toEqual({
      code: 'validation_failed',
      fields: [
        { field: 'email', message: { text: 'must be an email' } },
        { field: 'name', message: { text: 'too long' } },
      ],
    });
  });

  it('falls back to a generic form message for a 422 without issues', () => {
    const error = new ValidationError({ code: 'validation_failed', status: 422 });

    expect(mapAuthError(error).form).toEqual({ key: 'auth.errors.generic' });
  });

  it('reports a network failure', () => {
    const error = new NetworkError({ code: 'network.unreachable', status: 0 });

    expect(mapAuthError(error)).toEqual({
      code: 'network.unreachable',
      form: { key: 'auth.errors.network' },
      fields: [],
    });
  });

  it.each([
    ['a server error', new ServerError({ code: 'internal', status: 500 })],
    ['an unknown code', ekozError('something.new')],
  ])('falls back to a generic form message for %s', (_name, error) => {
    expect(mapAuthError(error).form).toEqual({ key: 'auth.errors.generic' });
  });

  it('falls back to a generic form message for a foreign error', () => {
    expect(mapAuthError(new TypeError('boom'))).toEqual({
      code: 'unknown',
      form: { key: 'auth.errors.generic' },
      fields: [],
    });
  });
});
