import { EkozError, RateLimitError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { ResetPasswordPage } from '@/features/auth/routes/reset-password-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk, type FakeSession } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function renderReset({
  token,
  passwordMinLength = 12,
  session,
}: {
  token?: string;
  passwordMinLength?: number;
  session?: FakeSession;
} = {}) {
  const fake = createFakeSdk(session);
  fake.stubs.auth.policy.mockResolvedValue({
    registrationMode: 'open',
    emailVerificationRequired: true,
    passwordMinLength,
  });
  createClientMock.mockReturnValue(fake.sdk);
  const rendered = renderWithProviders(
    <SdkProvider>
      <ResetPasswordPage token={token} />
    </SdkProvider>,
    { route: '/reset-password' },
  );
  return { fake, ...rendered, user: userEvent.setup() };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Change the password' }));

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('shows a skeleton while the policy is loading', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <ResetPasswordPage token="tok" />
    </SdkProvider>,
    { route: '/reset-password' },
  );

  expect(await screen.findByTestId('policy-skeleton')).toBeInTheDocument();
});

it('sets the new password, confirms with a toast and goes to /login', async () => {
  const { fake, router, user } = renderReset({ token: 'tok-1' });

  await user.type(await screen.findByLabelText('New password'), 'a-brand-new-password');
  await submit(user);

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(fake.stubs.auth.confirmPasswordReset).toHaveBeenCalledTimes(1);
  expect(fake.stubs.auth.confirmPasswordReset).toHaveBeenCalledWith({
    token: 'tok-1',
    newPassword: 'a-brand-new-password',
  });
  expect(toast.success).toHaveBeenCalledWith(
    'Your password was changed. Sign in with the new one.',
  );
});

it('applies the minimum password length of the policy', async () => {
  const { fake, user } = renderReset({ token: 'tok-1', passwordMinLength: 16 });

  await user.type(await screen.findByLabelText('New password'), 'too-short');
  await submit(user);

  expect(await screen.findByText('Use at least 16 characters.')).toBeInTheDocument();
  expect(fake.stubs.auth.confirmPasswordReset).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it('shows a password refused by the server on the password field', async () => {
  const { fake, router, user } = renderReset({ token: 'tok-1' });
  fake.stubs.auth.confirmPasswordReset.mockRejectedValue(
    new EkozError({ code: 'identity.password_too_weak', status: 422 }),
  );

  await user.type(await screen.findByLabelText('New password'), 'a-brand-new-password');
  await submit(user);

  const field = screen.getByLabelText('New password');
  await vi.waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
  expect(field).toHaveAccessibleDescription(expect.stringContaining('minimum requirements'));
  expect(router.state.location.pathname).toBe('/reset-password');
});

it('explains an invalid link and links to /forgot-password', async () => {
  const { fake, user } = renderReset({ token: 'stale' });
  fake.stubs.auth.confirmPasswordReset.mockRejectedValue(
    new EkozError({ code: 'auth.password_reset_invalid', status: 422 }),
  );

  await user.type(await screen.findByLabelText('New password'), 'a-brand-new-password');
  await submit(user);

  expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
  expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
  expect(toast.success).not.toHaveBeenCalled();
});

it('does not show a form when the token is missing', async () => {
  const { fake } = renderReset({});

  expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
  expect(screen.getByText(/link is incomplete/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(fake.stubs.auth.confirmPasswordReset).not.toHaveBeenCalled();
});

it('shows the seconds to wait after a rate limit', async () => {
  const { fake, user } = renderReset({ token: 'tok-1' });
  fake.stubs.auth.confirmPasswordReset.mockRejectedValue(
    new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 45 }),
  );

  await user.type(await screen.findByLabelText('New password'), 'a-brand-new-password');
  await submit(user);

  expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 45 seconds.');
});

it('stays reachable for a signed-in user', async () => {
  const { router } = renderReset({
    token: 'tok-1',
    session: { identifier: null, sessionId: 's1' },
  });

  expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/reset-password');
});

it('is available in French', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <ResetPasswordPage token="tok" />
    </SdkProvider>,
    { route: '/reset-password', language: 'fr' },
  );

  expect(await screen.findByLabelText('Nouveau mot de passe')).toBeInTheDocument();
});
