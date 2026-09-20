// @vitest-environment node
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { AppFrame } from '@/app/app-frame';
import { createI18n } from '@/app/i18n';
import { AppProviders } from '@/app/providers';
import { createClientMock } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

/** Mirrors what `__root.tsx` renders, under a server environment (no `window`, no `localStorage`). */
it('renders the providers and the shell on the server without touching the browser', async () => {
  expect(typeof window).toBe('undefined');
  const rootRoute = createRootRoute({
    component: () => (
      <AppProviders queryClient={new QueryClient()} i18nInstance={createI18n('fr')}>
        <AppFrame>
          <p>content</p>
        </AppFrame>
      </AppProviders>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();

  const html = renderToString(<RouterProvider router={router} />);

  expect(html).toContain('content');
  expect(html).toContain('Client web Ekoz');
  expect(createClientMock).not.toHaveBeenCalled();
});
