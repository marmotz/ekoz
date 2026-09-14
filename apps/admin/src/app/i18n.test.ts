import { beforeEach, describe, expect, it } from 'vitest';

import { createI18nInstance, LANGUAGE_STORAGE_KEY } from '@/app/i18n';

describe('createI18nInstance', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('falls back to English by default', () => {
    const i18n = createI18nInstance();

    expect(i18n.language).toBe('en');
    expect(i18n.t('appName')).toBe('Ekoz admin console');
  });

  it('switches language and persists the choice to localStorage', async () => {
    const i18n = createI18nInstance();

    await i18n.changeLanguage('fr');

    expect(i18n.t('appName')).toBe("Console d'administration Ekoz");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
});
