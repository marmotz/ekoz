import { screen } from '@testing-library/react';
import { createElement } from 'react';
import { expect, test } from 'vitest';

import { Route } from '@/routes/login';
import { renderWithProviders } from '../../test/render';

const LoginPage = Route.options.component;
if (!LoginPage) throw new Error('The login route has no component');

test('renders the login placeholder', async () => {
  renderWithProviders(createElement(LoginPage), { route: '/login' });

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(Route.options.staticData?.title).toBe('pages.login.title');
});
