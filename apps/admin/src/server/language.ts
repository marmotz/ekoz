import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/app/i18n';

/** Best-effort `Accept-Language` parse for the initial SSR render (technical.md §4). */
function pickSupportedLanguage(acceptLanguage: string | undefined): SupportedLanguage {
  if (!acceptLanguage) return FALLBACK_LANGUAGE;

  const preferred = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim().slice(0, 2).toLowerCase())
    .find((lang): lang is SupportedLanguage =>
      SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage),
    );

  return preferred ?? FALLBACK_LANGUAGE;
}

export const detectLanguage = createServerFn({ method: 'GET' }).handler(async () => {
  return pickSupportedLanguage(getRequestHeader('accept-language'));
});
