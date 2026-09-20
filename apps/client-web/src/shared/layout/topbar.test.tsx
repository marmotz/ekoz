import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';

import { createI18n } from '@/app/i18n';
import { Topbar } from '@/shared/layout/topbar';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../test/dropdown-menu-mock'));

function renderTopbar(language: string) {
  const rootRoute = createRootRoute({
    component: () => <Topbar theme="dark" onThemeChange={() => {}} />,
  });
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    staticData: { title: 'nav.home' },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(
    <I18nextProvider i18n={createI18n(language)}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

it('shows the translated staticData title of the current route', async () => {
  renderTopbar('fr');

  expect(await screen.findByRole('heading', { name: 'Accueil' })).toBeInTheDocument();
});

it('shows the language switcher and the theme toggle', async () => {
  renderTopbar('en');

  expect(await screen.findByRole('button', { name: 'Language' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
});
