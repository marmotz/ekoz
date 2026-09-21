import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

import { Route } from '@/routes/_auth/login';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../test/render';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const LoginRoute = Route.options.component;
if (!LoginRoute) throw new Error('The login route has no component');

const page = () => <SdkProvider>{createElement(LoginRoute)}</SdkProvider>;

test('renders the sign-in page for an anonymous visitor', async () => {
  createClientMock.mockReturnValue(createFakeSdk().sdk);

  renderWithProviders(page(), { route: '/login' });

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(Route.options.staticData?.title).toBe('auth.login.title');
});

test('redirects a signed-in user to /', async () => {
  createClientMock.mockReturnValue(createFakeSdk({ identifier: null, sessionId: 's1' }).sdk);

  const { router } = renderWithProviders(page(), { route: '/login' });

  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});

test('redirects once the login established the session', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.login.mockImplementation(async () => {
    fake.setSession({ identifier: null, sessionId: 's1' });
    fake.emit('session:authenticated', { identifier: null, sessionId: 's1' });
    return {};
  });
  createClientMock.mockReturnValue(fake.sdk);
  const user = userEvent.setup();

  const { router } = renderWithProviders(page(), { route: '/login' });
  await user.type(await screen.findByLabelText('Username or email'), 'jane');
  await user.type(screen.getByLabelText('Password'), 'a-long-enough-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});
