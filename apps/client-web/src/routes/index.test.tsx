import { screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

import { Route } from '@/routes/index';
import { getNavEntries } from '@/shared/layout/nav-registry';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../test/render';
import { createClientMock, createFakeSdk } from '../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const HomePage = Route.options.component;
if (!HomePage) throw new Error('The index route has no component');

test('renders the home placeholder', async () => {
  renderWithProviders(createElement(HomePage));

  expect(await screen.findByRole('heading', { name: 'Ekoz web client' })).toBeInTheDocument();
});

test('renders the home placeholder in French', async () => {
  renderWithProviders(createElement(HomePage), { language: 'fr' });

  expect(await screen.findByRole('heading', { name: 'Client web Ekoz' })).toBeInTheDocument();
});

test('shows the API server once it answered', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(<SdkProvider>{createElement(HomePage)}</SdkProvider>);

  expect(await screen.findByText('http://localhost:3010')).toBeInTheDocument();
  expect(fake.stubs.setup.state).toHaveBeenCalledTimes(1);
});

test('reports an unreachable server', async () => {
  const fake = createFakeSdk();
  fake.stubs.setup.state.mockRejectedValue(new Error('offline'));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(<SdkProvider>{createElement(HomePage)}</SdkProvider>);

  expect(await screen.findByText('The server could not be reached.')).toBeInTheDocument();
});

test('registers the Home navigation entry and its page title', () => {
  expect(getNavEntries().some((entry) => entry.id === 'home' && entry.to === '/')).toBe(true);
  expect(Route.options.staticData?.title).toBe('nav.home');
});
