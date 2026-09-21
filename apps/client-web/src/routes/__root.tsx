import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useState } from 'react';

import { createI18n } from '@/app/i18n';
import { AppProviders } from '@/app/providers';
import type { RouterContext } from '@/app/router-context';
import { themeScript } from '@/app/theme-script';
import { detectLanguage } from '@/server/language';
import { Toaster } from '@/shared/ui/sonner';
import appCss from '@/styles/globals.css?url';

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ekoz web client' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'stylesheet', href: appCss },
    ],
    scripts: [{ children: themeScript }],
  }),
  loader: async () => ({ locale: await detectLanguage() }),
  component: RootComponent,
});

function RootComponent() {
  const { locale } = Route.useLoaderData();
  const { queryClient } = Route.useRouteContext();
  const [i18nInstance] = useState(() => createI18n(locale));

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <AppProviders queryClient={queryClient} i18nInstance={i18nInstance}>
          <Outlet />
          <Toaster />
        </AppProviders>
        <Scripts />
      </body>
    </html>
  );
}
