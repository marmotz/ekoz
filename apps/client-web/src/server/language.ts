import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

import {
  FALLBACK_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/shared/i18n/config';

/** Picks the first supported language of an `Accept-Language` header; `en` otherwise. */
export function pickSupportedLanguage(acceptLanguage: string | undefined): SupportedLanguage {
  if (!acceptLanguage) return FALLBACK_LANGUAGE;

  const preferred = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim().slice(0, 2).toLowerCase())
    .find(isSupportedLanguage);

  return preferred ?? FALLBACK_LANGUAGE;
}

export const detectLanguage = createServerFn({ method: 'GET' }).handler(async () =>
  pickSupportedLanguage(getRequestHeader('accept-language')),
);
