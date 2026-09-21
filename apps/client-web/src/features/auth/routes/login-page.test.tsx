import { EkozError, NetworkError, RateLimitError, ServerError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { LoginPage } from '@/features/auth/routes/login-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function renderLogin(language = 'en') {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);
  const rendered = renderWithProviders(
    <SdkProvider>
      <LoginPage />
    </SdkProvider>,
    { route: '/login', language },
  );
  return { fake, ...rendered, user: userEvent.setup() };
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  identifier: string,
  password = 'a-long-enough-password',
) {
  await user.type(await screen.findByLabelText('Username or email'), identifier);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('signs in with the identifier and the password, and no device name', async () => {
  const { fake, user } = renderLogin();

  await fillAndSubmit(user, 'jane');

  await vi.waitFor(() => expect(fake.stubs.auth.login).toHaveBeenCalledTimes(1));
  expect(fake.stubs.auth.login).toHaveBeenCalledWith({
    identifier: 'jane',
    password: 'a-long-enough-password',
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('accepts `name/server` and an email address as the identifier', async () => {
  const { fake, user } = renderLogin();

  await fillAndSubmit(user, 'jane/example.com');

  await vi.waitFor(() =>
    expect(fake.stubs.auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'jane/example.com' }),
    ),
  );
});

it('asks for both fields before calling the server', async () => {
  const { fake, user } = renderLogin();

  await user.click(await screen.findByRole('button', { name: 'Sign in' }));

  expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
  expect(fake.stubs.auth.login).not.toHaveBeenCalled();
});

it('shows a generic message for wrong credentials', async () => {
  const { fake, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(
    new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
  );

  await fillAndSubmit(user, 'jane');

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect identifier or password.');
});

it('shows that the account is suspended', async () => {
  const { fake, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(
    new EkozError({ code: 'identity.account_suspended', status: 403 }),
  );

  await fillAndSubmit(user, 'jane');

  expect(await screen.findByRole('alert')).toHaveTextContent('This account is suspended.');
});

it('shows the seconds to wait after a rate limit', async () => {
  const { fake, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(
    new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 30 }),
  );

  await fillAndSubmit(user, 'jane');

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Too many attempts. Try again in 30 seconds.',
  );
});

it.each([
  [
    'a network error',
    new NetworkError({ code: 'network.unreachable', status: 0 }),
    'could not be reached',
  ],
  ['a server error', new ServerError({ code: 'internal', status: 500 }), 'Something went wrong'],
])('shows a message for %s', async (_name, error, text) => {
  const { fake, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(error);

  await fillAndSubmit(user, 'jane');

  expect(await screen.findByRole('alert')).toHaveTextContent(text);
});

it('links an unverified account to /check-email with the email in the router state', async () => {
  const { fake, router, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(
    new EkozError({ code: 'identity.email_not_verified', status: 403 }),
  );

  await fillAndSubmit(user, 'jane@example.com');
  expect(await screen.findByRole('alert')).toHaveTextContent('not verified yet');
  await user.click(screen.getByRole('link', { name: 'Send the verification email again' }));

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/check-email'));
  expect(router.state.location.state.email).toBe('jane@example.com');
  expect(router.state.location.href).toBe('/check-email');
});

it('does not pass a username as the email when the account is unverified', async () => {
  const { fake, router, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValue(
    new EkozError({ code: 'identity.email_not_verified', status: 403 }),
  );

  await fillAndSubmit(user, 'jane');
  await user.click(await screen.findByRole('link', { name: 'Send the verification email again' }));

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/check-email'));
  expect(router.state.location.state.email).toBeUndefined();
});

it('clears the previous error when submitting again', async () => {
  const { fake, user } = renderLogin();
  fake.stubs.auth.login.mockRejectedValueOnce(
    new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
  );

  await fillAndSubmit(user, 'jane');
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  await vi.waitFor(() => expect(fake.stubs.auth.login).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('links to registration and to the password reset', async () => {
  const { user, router } = renderLogin();

  expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute(
    'href',
    '/register',
  );
  await user.click(screen.getByRole('link', { name: 'Forgot your password?' }));

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/forgot-password'));
});

it('is available in French', async () => {
  renderLogin('fr');

  expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  expect(screen.getByLabelText("Nom d'utilisateur ou e-mail")).toBeInTheDocument();
});
