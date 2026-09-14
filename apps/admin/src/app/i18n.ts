import i18next, { type i18n } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonEn from '@/shared/i18n/locales/en/common.json';
import invitationsEn from '@/shared/i18n/locales/en/invitations.json';
import setupEn from '@/shared/i18n/locales/en/setup.json';
import usersEn from '@/shared/i18n/locales/en/users.json';
import commonFr from '@/shared/i18n/locales/fr/common.json';
import invitationsFr from '@/shared/i18n/locales/fr/invitations.json';
import setupFr from '@/shared/i18n/locales/fr/setup.json';
import usersFr from '@/shared/i18n/locales/fr/users.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'ekoz.admin.lang';

const resources = {
  en: { common: commonEn, setup: setupEn, users: usersEn, invitations: invitationsEn },
  fr: { common: commonFr, setup: setupFr, users: usersFr, invitations: invitationsFr },
};

/** A fresh i18next instance per SSR request (technical.md §4); the client re-hydrates it once mounted. */
export function createI18nInstance(detectedLanguage?: string): i18n {
  const instance = i18next.createInstance();
  const usesBrowserDetection = typeof window !== 'undefined';

  if (usesBrowserDetection) {
    instance.use(LanguageDetector);
  }
  instance.use(initReactI18next);

  instance.init({
    resources,
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: FALLBACK_LANGUAGE,
    lng: usesBrowserDetection ? undefined : detectedLanguage,
    ns: ['common', 'setup', 'users', 'invitations'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: usesBrowserDetection
      ? {
          order: ['localStorage', 'navigator'],
          lookupLocalStorage: LANGUAGE_STORAGE_KEY,
          caches: ['localStorage'],
        }
      : undefined,
  });

  return instance;
}
