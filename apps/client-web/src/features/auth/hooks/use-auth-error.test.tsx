import { EkozError, RateLimitError, ValidationError } from '@ekozhq/sdk';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';

import { createI18n } from '@/app/i18n';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';

function wrapper(language = 'en') {
  const i18n = createI18n(language);
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  );
}

const fields = ['email', 'password'] as const;

it('starts without any error', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper() });

  expect(result.current).toMatchObject({ formError: null, fieldErrors: {}, code: null });
});

it('shows a form-level error in the current language', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper('fr') });

  act(() => {
    result.current.apply(new EkozError({ code: 'auth.invalid_credentials', status: 401 }));
  });

  expect(result.current.formError).toBe('Identifiant ou mot de passe incorrect.');
  expect(result.current.code).toBe('auth.invalid_credentials');
});

it('puts a field error on its field', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper() });

  act(() => {
    result.current.apply(new EkozError({ code: 'identity.email_taken', status: 422 }));
  });

  expect(result.current.fieldErrors).toEqual({ email: 'This email address is already in use.' });
  expect(result.current.formError).toBeNull();
});

it('moves a field error to the form when the form has no such field', () => {
  const { result } = renderHook(() => useAuthError({ fields: ['email'] }), {
    wrapper: wrapper(),
  });

  act(() => {
    result.current.apply(new EkozError({ code: 'identity.password_too_weak', status: 422 }));
  });

  expect(result.current.fieldErrors).toEqual({});
  expect(result.current.formError).toBe('This password does not meet the minimum requirements.');
});

it('renames a body field to the form field', () => {
  const rename = { password: 'newPassword' };
  const { result } = renderHook(() => useAuthError({ fields: ['newPassword'], rename }), {
    wrapper: wrapper(),
  });

  act(() => {
    result.current.apply(new EkozError({ code: 'identity.password_too_weak', status: 422 }));
  });

  expect(result.current.fieldErrors).toEqual({
    newPassword: 'This password does not meet the minimum requirements.',
  });
});

it('shows the seconds to wait after a rate limit, with the plural form', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper() });

  act(() => {
    result.current.apply(
      new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 1 }),
    );
  });
  expect(result.current.formError).toBe('Too many attempts. Try again in 1 second.');

  act(() => {
    result.current.apply(
      new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 30 }),
    );
  });
  expect(result.current.formError).toBe('Too many attempts. Try again in 30 seconds.');
});

it('keeps the text of a server validation issue', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper() });

  act(() => {
    result.current.apply(
      new ValidationError({
        code: 'validation_failed',
        status: 422,
        issues: [{ path: 'email', message: 'must be an email' }],
      }),
    );
  });

  expect(result.current.fieldErrors).toEqual({ email: 'must be an email' });
});

it('returns how the error was mapped and forgets it on reset', () => {
  const { result } = renderHook(() => useAuthError({ fields }), { wrapper: wrapper() });
  let mapped: ReturnType<typeof result.current.apply> | undefined;

  act(() => {
    mapped = result.current.apply(
      new EkozError({ code: 'identity.email_not_verified', status: 403 }),
    );
  });
  expect(mapped?.code).toBe('identity.email_not_verified');

  act(() => result.current.reset());
  expect(result.current).toMatchObject({ formError: null, fieldErrors: {}, code: null });
});
