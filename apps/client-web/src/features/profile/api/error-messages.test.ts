import { EkozError, NetworkError, RateLimitError } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_ERROR_TABLE, mapAccountError } from '@/features/profile/api/error-messages';

describe('mapAccountError', () => {
  it.each(Object.entries(ACCOUNT_ERROR_TABLE))('maps %s to %s', (code, key) => {
    expect(mapAccountError(new EkozError({ code, status: 422 }))).toEqual({
      code,
      message: { key },
    });
  });

  it('covers every code of the technical design', () => {
    expect(Object.keys(ACCOUNT_ERROR_TABLE).sort()).toEqual(
      [
        'auth.invalid_credentials',
        'identity.password_too_weak',
        'identity.email_taken',
        'identity.identifier_invalid',
        'identity.username_taken',
        'identity.username_immutable',
        'identity.username_change_cooldown',
        'identity.username_request_pending',
        'identity.profile_invalid',
        'identity.avatar_too_large',
        'identity.avatar_rejected',
        'identity.last_owner',
      ].sort(),
    );
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(mapAccountError(new EkozError({ code: 'identity.unheard_of', status: 500 }))).toEqual({
      code: 'identity.unheard_of',
      message: { key: 'account.errors.generic' },
    });
  });

  it('reports a network failure', () => {
    const mapped = mapAccountError(new NetworkError({ code: 'network', status: 0 }));

    expect(mapped.message).toEqual({ key: 'account.errors.network' });
  });

  it('reports the wait of a rate limit, rounded up', () => {
    const mapped = mapAccountError(
      new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 4.2 }),
    );

    expect(mapped.message).toEqual({ key: 'account.errors.tooManyRequests', values: { count: 5 } });
  });

  it('reports a rate limit without a wait', () => {
    const mapped = mapAccountError(
      new RateLimitError({ code: 'auth.too_many_requests', status: 429 }),
    );

    expect(mapped.message).toEqual({ key: 'account.errors.tooManyRequestsLater' });
  });

  it('falls back to a generic message for anything else', () => {
    expect(mapAccountError(new Error('boom'))).toEqual({
      code: 'unknown',
      message: { key: 'account.errors.generic' },
    });
  });
});
