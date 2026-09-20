import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { i18n } from 'i18next';
import { type ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ThemeProvider } from '@/app/theme';
import { readStoredLanguage, setHtmlLanguage } from '@/shared/i18n/config';

/**
 * The server renders with the `Accept-Language` language; once hydrated, a
 * language the user picked earlier (`localStorage`) takes over (technical.md §9).
 */
function StoredLanguageSync({ i18nInstance }: { i18nInstance: i18n }) {
  useEffect(() => {
    const stored = readStoredLanguage();
    if (stored && stored !== i18nInstance.language) {
      void i18nInstance.changeLanguage(stored);
      setHtmlLanguage(stored);
    }
  }, [i18nInstance]);

  return null;
}

export function AppProviders({
  children,
  queryClient,
  i18nInstance,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  i18nInstance: i18n;
}) {
  return (
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StoredLanguageSync i18nInstance={i18nInstance} />
          {children}
        </ThemeProvider>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </I18nextProvider>
  );
}
