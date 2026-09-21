import { RateLimitError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from '@/features/auth/routes/forgot-password-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function renderForgot(language = 'en') {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);
  const rendered = renderWithProviders(
    <SdkProvider>
      <ForgotPasswordPage />
    </SdkProvider>,
    { route: '/forgot-password', language },
  );
  return { fake, ...rendered, user: userEvent.setup() };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Send the link' }));

beforeEach(() => {
  createClientMock.mockReset();
});

it('asks for the email address', async () => {
  renderForgot();

  expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
});

it('requests the reset and shows a confirmation that says nothing about the address', async () => {
  const { fake, user } = renderForgot();

  await user.type(await screen.findByLabelText('Email address'), 'jane@example.com');
  await submit(user);

  expect(await screen.findByText(/If an account matches this address/)).toBeInTheDocument();
  expect(fake.stubs.auth.requestPasswordReset).toHaveBeenCalledTimes(1);
  expect(fake.stubs.auth.requestPasswordReset).toHaveBeenCalledWith({ email: 'jane@example.com' });
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
});

it('shows the same confirmation for any address', async () => {
  const first = renderForgot();
  await first.user.type(await screen.findByLabelText('Email address'), 'known@example.com');
  await submit(first.user);
  const known = (await screen.findByText(/If an account matches/)).textContent;
  first.unmount();

  const second = renderForgot();
  await second.user.type(await screen.findByLabelText('Email address'), 'unknown@example.com');
  await submit(second.user);

  expect((await screen.findByText(/If an account matches/)).textContent).toBe(known);
});

it('rejects an invalid address without calling the server', async () => {
  const { fake, user } = renderForgot();

  await user.type(await screen.findByLabelText('Email address'), 'nope');
  await submit(user);

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  expect(fake.stubs.auth.requestPasswordReset).not.toHaveBeenCalled();
});

it('shows the seconds to wait after a rate limit and keeps the form', async () => {
  const { fake, user } = renderForgot();
  fake.stubs.auth.requestPasswordReset.mockRejectedValue(
    new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 60 }),
  );

  await user.type(await screen.findByLabelText('Email address'), 'jane@example.com');
  await submit(user);

  expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 60 seconds.');
  expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  expect(screen.queryByText(/If an account matches/)).not.toBeInTheDocument();
});

it('is available in French', async () => {
  renderForgot('fr');

  expect(await screen.findByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument();
});
