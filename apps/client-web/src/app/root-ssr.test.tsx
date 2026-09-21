// @vitest-environment node
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { AppFrame } from '@/app/app-frame';
import { createI18n } from '@/app/i18n';
import { AppProviders } from '@/app/providers';
import { useTheme } from '@/app/use-theme';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { createClientMock } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function AuthRouteLayout() {
  const { theme, setTheme } = useTheme();

  return (
    <AuthLayout theme={theme} onThemeChange={setTheme}>
      <Outlet />
    </AuthLayout>
  );
}

/**
 * Mirrors what `__root.tsx` and its two layouts render: providers around an outlet, the
 * shell under `_app`, the centered card under `_auth`. Server environment (no `window`,
 * no `localStorage`).
 */
async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppProviders queryClient={new QueryClient()} i18nInstance={createI18n('fr')}>
        <Outlet />
      </AppProviders>
    ),
  });
  const appLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: '_app',
    component: () => (
      <AppFrame>
        <Outlet />
      </AppFrame>
    ),
  });
  const authLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: '_auth',
    component: AuthRouteLayout,
  });
  const home = createRoute({
    getParentRoute: () => appLayout,
    path: '/',
    component: () => <p>home content</p>,
  });
  const login = createRoute({
    getParentRoute: () => authLayout,
    path: '/login',
    component: () => <p>login content</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      appLayout.addChildren([home]),
      authLayout.addChildren([login]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();

  return renderToString(<RouterProvider router={router} />);
}

it('renders the providers and the shell on the server without touching the browser', async () => {
  expect(typeof window).toBe('undefined');

  const html = await renderAt('/');

  expect(html).toContain('home content');
  expect(html).toContain('Client web Ekoz');
  expect(html).toContain('Ouvrir la navigation');
  expect(createClientMock).not.toHaveBeenCalled();
});

it('renders an anonymous page on the server inside the auth layout, without the shell', async () => {
  const html = await renderAt('/login');

  expect(html).toContain('login content');
  expect(html).toContain('Langue');
  expect(html).not.toContain('Ouvrir la navigation');
  expect(createClientMock).not.toHaveBeenCalled();
});
