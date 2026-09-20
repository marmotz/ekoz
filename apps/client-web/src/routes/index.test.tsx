import { screen } from '@testing-library/react';
import { createElement } from 'react';
import { expect, test } from 'vitest';

import { Route } from '@/routes/index';
import { renderWithProviders } from '../../test/render';

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
