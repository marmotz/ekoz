import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from '@/shared/i18n/config';
import commonEn from '@/shared/i18n/locales/en/common.json';
import commonFr from '@/shared/i18n/locales/fr/common.json';

const resources = {
  en: { common: commonEn },
  fr: { common: commonFr },
};

/**
 * A fresh i18next instance per request (technical.md §9): a module-level
 * instance would share its language between concurrent SSR requests.
 */
export function createI18n(lng: string = FALLBACK_LANGUAGE): i18n {
  const instance = i18next.createInstance();
  instance.use(initReactI18next);
  void instance.init({
    resources,
    lng,
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: FALLBACK_LANGUAGE,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
