import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import { createI18nInstance } from '@/app/i18n';
import { ThemeProvider } from '@/app/theme';
import { SdkContext } from '@/shared/sdk/provider';
import { Toaster } from '@/shared/ui/sonner';

/**
 * Mounts a route file's exported `Route` in isolation, under a fresh root —
 * sidestepping the real `__root.tsx` (SSR loader, `<html>` shell, real
 * `SdkProvider`), which is not meaningful in a jsdom unit test.
 *
 * A `createFileRoute(...)`-produced `Route` has no `path` / `getParentRoute`
 * of its own (the real app gets those from the generated `routeTree.gen.ts`
 * at codegen time), so this wires them here via `Route.update(...)` — the
 * same mechanism the codegen output itself uses.
 */
export function renderRoute({
  route,
  path,
  initialPath,
  sdk,
  queryClient = new QueryClient(),
  extraPaths = [],
}: {
  route: AnyRoute;
  /** The route's own path, matching its file location (e.g. `/users/$userId`). */
  path: string;
  /** History entry to start on — differs from `path` for dynamic segments (e.g. `/users/u1`). */
  initialPath: string;
  sdk: EkozClient | null;
  queryClient?: QueryClient;
  extraPaths?: string[];
}) {
  const rootRoute = createRootRoute({});
  // `createFileRoute(...)(options)` sets this to `false` itself; a plain `createRoute(...)`
  // (used by some tests to build an ad-hoc route) defaults it to `true`, which confuses
  // route matching once attached as a non-root child below.
  route.isRoot = false;
  // `.update`'s public type only models runtime option changes, not the structural
  // `path`/`getParentRoute` rewiring the real router codegen performs — but that is
  // exactly what it does at runtime (`Object.assign(this.options, options)`).
  (route.update as (options: Record<string, unknown>) => void)({
    path,
    getParentRoute: () => rootRoute,
  });
  const stubRoutes = extraPaths.map((stubPath) =>
    createRoute({ getParentRoute: () => rootRoute, path: stubPath, component: () => null }),
  );
  const routeTree = rootRoute.addChildren([route, ...stubRoutes]);
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree, history });
  const i18nInstance = createI18nInstance();

  const result = render(
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SdkContext.Provider value={sdk}>
            <RouterProvider router={router} />
            <Toaster />
          </SdkContext.Provider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );

  return { ...result, router };
}
