import { describe, expect, it } from 'vitest';

import { createI18n } from '@/app/i18n';

describe('createI18n', () => {
  it('defaults to English', () => {
    const i18n = createI18n();

    expect(i18n.language).toBe('en');
    expect(i18n.t('appName')).toBe('Ekoz web client');
  });

  it('translates in French', () => {
    expect(createI18n('fr').t('appName')).toBe('Client web Ekoz');
  });

  it('falls back to English for an unsupported language', () => {
    expect(createI18n('de').t('appName')).toBe('Ekoz web client');
  });

  it('returns an independent instance per call', async () => {
    const first = createI18n('en');
    const second = createI18n('en');

    await first.changeLanguage('fr');

    expect(first).not.toBe(second);
    expect(second.language).toBe('en');
  });

  it('has the same keys in every catalogue', async () => {
    const { default: en } = await import('@/shared/i18n/locales/en/common.json');
    const { default: fr } = await import('@/shared/i18n/locales/fr/common.json');
    const keys = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
      );

    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });
});
