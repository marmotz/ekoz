import { EkozError, NetworkError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { VerifyEmailPage } from '@/features/auth/routes/verify-email-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk, type FakeSession } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function renderVerify({ token, session }: { token?: string; session?: FakeSession } = {}) {
  const fake = createFakeSdk(session);
  createClientMock.mockReturnValue(fake.sdk);
  const rendered = renderWithProviders(
    <StrictMode>
      <SdkProvider>
        <VerifyEmailPage token={token} />
      </SdkProvider>
    </StrictMode>,
    { route: '/verify-email' },
  );
  return { fake, ...rendered, user: userEvent.setup() };
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('verifies the token once, even under Strict Mode, and offers to sign in', async () => {
  const { fake } = renderVerify({ token: 'tok-1' });

  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  expect(fake.stubs.auth.verifyEmail).toHaveBeenCalledTimes(1);
  expect(fake.stubs.auth.verifyEmail).toHaveBeenCalledWith({ token: 'tok-1' });
  expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
});

it('shows a pending state while the server answers', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.verifyEmail.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <VerifyEmailPage token="tok-1" />
    </SdkProvider>,
    { route: '/verify-email' },
  );

  expect(await screen.findByTestId('verify-email-skeleton')).toBeInTheDocument();
});

it('waits for the SDK before verifying', async () => {
  const fake = createFakeSdk();
  fake.stubs.session.resume.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <VerifyEmailPage token="tok-1" />
    </SdkProvider>,
    { route: '/verify-email' },
  );

  expect(await screen.findByTestId('verify-email-skeleton')).toBeInTheDocument();
  expect(fake.stubs.auth.verifyEmail).not.toHaveBeenCalled();
});

it('explains an invalid token and offers the resend form', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.verifyEmail.mockRejectedValue(
    new EkozError({ code: 'identity.email_verification_invalid', status: 422 }),
  );
  createClientMock.mockReturnValue(fake.sdk);
  const user = userEvent.setup();

  renderWithProviders(
    <SdkProvider>
      <VerifyEmailPage token="stale" />
    </SdkProvider>,
    { route: '/verify-email' },
  );

  expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
  expect(
    screen.getByText('This verification link is invalid or has already been used.'),
  ).toBeInTheDocument();
  await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
  await user.click(screen.getByRole('button', { name: 'Send the email again' }));

  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(fake.stubs.auth.resendVerification).toHaveBeenCalledWith({ email: 'jane@example.com' });
});

it('does not call the server when the token is missing, and offers the resend form', async () => {
  const { fake } = renderVerify({});

  expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
  expect(screen.getByText(/link is incomplete/)).toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  expect(fake.stubs.auth.verifyEmail).not.toHaveBeenCalled();
});

it('stays reachable, and verifies, for a signed-in user', async () => {
  const { fake, router } = renderVerify({
    token: 'tok-1',
    session: { identifier: null, sessionId: 's1' },
  });

  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  expect(fake.stubs.auth.verifyEmail).toHaveBeenCalledTimes(1);
  expect(router.state.location.pathname).toBe('/verify-email');
});

it('lets the user try again after a failure that is not about the token', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.verifyEmail
    .mockRejectedValueOnce(new NetworkError({ code: 'network.unreachable', status: 0 }))
    .mockResolvedValueOnce({ verified: true });
  createClientMock.mockReturnValue(fake.sdk);
  const user = userEvent.setup();

  renderWithProviders(
    <SdkProvider>
      <VerifyEmailPage token="tok-1" />
    </SdkProvider>,
    { route: '/verify-email' },
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('could not be reached');
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  expect(fake.stubs.auth.verifyEmail).toHaveBeenCalledTimes(2);
});

it('is available in French', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <VerifyEmailPage token="tok-1" />
    </SdkProvider>,
    { route: '/verify-email', language: 'fr' },
  );

  expect(await screen.findByRole('heading', { name: 'E-mail vérifié' })).toBeInTheDocument();
});
