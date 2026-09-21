import { RateLimitError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { CheckEmailPage } from '@/features/auth/routes/check-email-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function page() {
  return (
    <SdkProvider>
      <CheckEmailPage />
    </SdkProvider>
  );
}

function fakeWithPolicy(emailVerificationRequired: boolean) {
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockResolvedValue({
    registrationMode: 'open',
    emailVerificationRequired,
    passwordMinLength: 12,
  });
  createClientMock.mockReturnValue(fake.sdk);
  return fake;
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a skeleton while the policy is loading', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(page(), { route: '/check-email' });

  expect(await screen.findByTestId('policy-skeleton')).toBeInTheDocument();
});

it('shows a skeleton until the SDK is ready', async () => {
  const fake = createFakeSdk();
  fake.stubs.session.resume.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(page(), { route: '/check-email' });

  expect(await screen.findByTestId('policy-skeleton')).toBeInTheDocument();
  expect(fake.stubs.auth.policy).not.toHaveBeenCalled();
});

it('asks to check the mailbox when verification is required, with the email from the router state', async () => {
  fakeWithPolicy(true);

  renderWithProviders(page(), { route: '/check-email', state: { email: 'jane@example.com' } });

  expect(await screen.findByRole('heading', { name: 'Check your mailbox' })).toBeInTheDocument();
  expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send the email again' })).toBeInTheDocument();
});

it('never puts the email in the URL', async () => {
  fakeWithPolicy(true);

  const { router } = renderWithProviders(page(), {
    route: '/check-email',
    state: { email: 'jane@example.com' },
  });
  await screen.findByRole('heading', { name: 'Check your mailbox' });

  expect(router.state.location.href).toBe('/check-email');
});

it('resends the verification email to the address from the router state', async () => {
  const user = userEvent.setup();
  const fake = fakeWithPolicy(true);
  renderWithProviders(page(), { route: '/check-email', state: { email: 'jane@example.com' } });

  await user.click(await screen.findByRole('button', { name: 'Send the email again' }));

  expect(await screen.findByRole('status')).toHaveTextContent('a new email is on its way');
  expect(fake.stubs.auth.resendVerification).toHaveBeenCalledTimes(1);
  expect(fake.stubs.auth.resendVerification).toHaveBeenCalledWith({ email: 'jane@example.com' });
});

it('asks for the email when the router state has none (after a reload)', async () => {
  const user = userEvent.setup();
  const fake = fakeWithPolicy(true);
  renderWithProviders(page(), { route: '/check-email' });

  await user.type(await screen.findByLabelText('Email address'), 'jane@example.com');
  await user.click(screen.getByRole('button', { name: 'Send the email again' }));

  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(fake.stubs.auth.resendVerification).toHaveBeenCalledWith({ email: 'jane@example.com' });
});

it('rejects an invalid email typed by hand without calling the server', async () => {
  const user = userEvent.setup();
  const fake = fakeWithPolicy(true);
  renderWithProviders(page(), { route: '/check-email' });

  await user.type(await screen.findByLabelText('Email address'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Send the email again' }));

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  expect(fake.stubs.auth.resendVerification).not.toHaveBeenCalled();
});

it('shows the rate limit with the seconds to wait', async () => {
  const user = userEvent.setup();
  const fake = fakeWithPolicy(true);
  fake.stubs.auth.resendVerification.mockRejectedValue(
    new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 42 }),
  );
  renderWithProviders(page(), { route: '/check-email', state: { email: 'jane@example.com' } });

  await user.click(await screen.findByRole('button', { name: 'Send the email again' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Too many attempts. Try again in 42 seconds.',
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('says the account is ready, without a resend, when no verification is required', async () => {
  fakeWithPolicy(false);

  renderWithProviders(page(), { route: '/check-email', state: { email: 'jane@example.com' } });

  expect(await screen.findByRole('heading', { name: 'Account created' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('button', { name: 'Send the email again' })).not.toBeInTheDocument();
});

it('offers to retry when the policy cannot be loaded', async () => {
  const user = userEvent.setup();
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockRejectedValueOnce(new Error('offline'));
  createClientMock.mockReturnValue(fake.sdk);
  renderWithProviders(page(), { route: '/check-email' });

  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  await waitFor(() => expect(fake.stubs.auth.policy).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('heading', { name: 'Check your mailbox' })).toBeInTheDocument();
});

it('is available in French', async () => {
  fakeWithPolicy(true);

  renderWithProviders(page(), { route: '/check-email', language: 'fr' });

  expect(
    await screen.findByRole('heading', { name: 'Vérifiez votre boîte mail' }),
  ).toBeInTheDocument();
});
