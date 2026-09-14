import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { createI18nInstance } from '@/app/i18n';
import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/app/query-client';
import { ThemeScriptTag } from '@/app/theme-script';
import { detectLanguage } from '@/server/language';
import appCss from '@/styles/globals.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ekoz admin console' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  loader: () => detectLanguage(),
  component: RootComponent,
});

function RootComponent() {
  const detectedLanguage = Route.useLoaderData();
  const queryClient = createQueryClient();
  const i18nInstance = createI18nInstance(detectedLanguage);

  return (
    <html lang={detectedLanguage} suppressHydrationWarning>
      <head>
        <HeadContent />
        <ThemeScriptTag />
      </head>
      <body suppressHydrationWarning>
        <AppProviders queryClient={queryClient} i18nInstance={i18nInstance}>
          <Outlet />
        </AppProviders>
        <Scripts />
      </body>
    </html>
  );
}
