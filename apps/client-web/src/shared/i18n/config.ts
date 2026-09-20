export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'ekoz.lang';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

/** Reads the persisted language choice; `null` when absent, unsupported, or storage is unavailable. */
export function readStoredLanguage(): SupportedLanguage | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setHtmlLanguage(language: SupportedLanguage): void {
  document.documentElement.lang = language;
}

/** Persists the language choice and reflects it on `<html lang>`; storage failures are ignored. */
export function persistLanguage(language: SupportedLanguage): void {
  setHtmlLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage unavailable: the choice just will not survive a reload.
  }
}
