import { screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { Route } from '@/routes/_app';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../test/render';
import { createClientMock, createFakeSdk } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const AppLayout = Route.options.component;
if (!AppLayout) throw new Error('The _app layout has no component');

beforeEach(() => {
  createClientMock.mockReset();
});

it('redirects an anonymous visitor to /login', async () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  const { router } = renderWithProviders(<SdkProvider>{createElement(AppLayout)}</SdkProvider>, {
    route: '/',
  });

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
});

it('keeps an authenticated user on the page', async () => {
  createClientMock.mockReturnValue(createFakeSdk({ identifier: null, sessionId: 's1' }).sdk);

  const { router } = renderWithProviders(<SdkProvider>{createElement(AppLayout)}</SdkProvider>, {
    route: '/',
  });

  expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/');
});
