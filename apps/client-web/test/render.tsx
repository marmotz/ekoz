import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { createI18n } from '@/app/i18n';
import { ThemeProvider } from '@/app/theme';

interface RenderOptions {
  /** History entry to start on. */
  route?: string;
  language?: string;
  queryClient?: QueryClient;
  /** Router `state` of the initial history entry (what `navigate({ state })` would carry). */
  state?: Record<string, unknown>;
}

/**
 * Mounts `ui` under the providers the app provides (i18n, query client, theme)
 * and an in-memory TanStack router, so `Link` / `useNavigate` work. `ui` is
 * rendered for every path. Providers are added here as the app grows.
 *
 * Routing is asynchronous: assert with `findBy*` queries.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', language = 'en', queryClient, state }: RenderOptions = {},
) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => ui,
  });
  const history = createMemoryHistory({ initialEntries: [route] });
  if (state) history.replace(route, state);
  const router = createRouter({
    routeTree: rootRoute.addChildren([catchAll]),
    history,
  });
  const i18nInstance = createI18n(language);

  const result = render(
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );

  return { ...result, router, queryClient: client, i18n: i18nInstance };
}
