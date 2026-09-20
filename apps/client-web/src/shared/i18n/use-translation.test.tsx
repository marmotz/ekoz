import { renderHook } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';

import { createI18n } from '@/app/i18n';
import { useTranslation } from '@/shared/i18n/use-translation';

it('translates known keys', () => {
  const { result } = renderHook(() => useTranslation(), {
    wrapper: ({ children }) => (
      <I18nextProvider i18n={createI18n('fr')}>{children}</I18nextProvider>
    ),
  });

  expect(result.current.t('nav.home')).toBe('Accueil');
});

// The typecheck is the assertion here: `@ts-expect-error` fails it if the key type-checks.
it('rejects unknown keys at type level', () => {
  const { result } = renderHook(() => useTranslation(), {
    wrapper: ({ children }) => <I18nextProvider i18n={createI18n()}>{children}</I18nextProvider>,
  });

  // @ts-expect-error `nav.unknown` is not a key of `en/common.json`
  const translated = result.current.t('nav.unknown');

  expect(typeof translated).toBe('string');
});
