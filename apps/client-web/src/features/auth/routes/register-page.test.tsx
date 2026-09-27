import { EkozError, RateLimitError } from '@ekozhq/sdk';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { RegisterPage } from '@/features/auth/routes/register-page';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

type Mode = 'open' | 'invite' | 'admin';

function renderRegister({
  mode = 'open',
  passwordMinLength = 12,
  invite,
}: {
  mode?: Mode;
  passwordMinLength?: number;
  invite?: string;
} = {}) {
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockResolvedValue({
    registrationMode: mode,
    emailVerificationRequired: true,
    passwordMinLength,
    linkPreviews: false,
  });
  createClientMock.mockReturnValue(fake.sdk);
  const rendered = renderWithProviders(
    <SdkProvider>
      <RegisterPage invite={invite} />
    </SdkProvider>,
    { route: '/register' },
  );
  return { fake, ...rendered, user: userEvent.setup() };
}

async function fillIdentity(
  user: ReturnType<typeof userEvent.setup>,
  password = 'a-long-enough-password',
) {
  await user.type(await screen.findByLabelText('Username'), 'jane');
  await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
  await user.type(screen.getByLabelText('Display name'), 'Jane Doe');
  await user.type(screen.getByLabelText('Password'), password);
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Create the account' }));

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a skeleton while the policy is loading', async () => {
  const fake = createFakeSdk();
  fake.stubs.auth.policy.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <RegisterPage />
    </SdkProvider>,
    { route: '/register' },
  );

  expect(await screen.findByTestId('policy-skeleton')).toBeInTheDocument();
});

it('shows the closed message and no form when registration is by an administrator', async () => {
  renderRegister({ mode: 'admin' });

  expect(await screen.findByText(/Registration is closed/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Already have an account? Sign in' })).toHaveAttribute(
    'href',
    '/login',
  );
});

it('has no invitation field in open mode', async () => {
  renderRegister({ mode: 'open', invite: 'ignored' });

  await screen.findByLabelText('Username');
  expect(screen.queryByLabelText('Invitation code')).not.toBeInTheDocument();
});

it('registers in open mode and goes to /check-email with the email in the router state', async () => {
  const { fake, router, user } = renderRegister({ mode: 'open' });

  await fillIdentity(user);
  await submit(user);

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/check-email'));
  expect(fake.stubs.auth.register).toHaveBeenCalledTimes(1);
  expect(fake.stubs.auth.register).toHaveBeenCalledWith({
    name: 'jane',
    email: 'jane@example.com',
    displayName: 'Jane Doe',
    password: 'a-long-enough-password',
  });
  expect(router.state.location.state.email).toBe('jane@example.com');
  expect(router.state.location.href).toBe('/check-email');
});

it('requires an invitation in invite mode and pre-fills it from the link', async () => {
  const { fake, router, user } = renderRegister({ mode: 'invite', invite: 'tok-123' });

  expect(await screen.findByLabelText('Invitation code')).toHaveValue('tok-123');
  await fillIdentity(user);
  await submit(user);

  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/check-email'));
  expect(fake.stubs.auth.register).toHaveBeenCalledWith(
    expect.objectContaining({ invitationToken: 'tok-123' }),
  );
});

it('refuses an empty invitation in invite mode', async () => {
  const { fake, user } = renderRegister({ mode: 'invite' });

  await fillIdentity(user);
  await submit(user);

  expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  expect(screen.getByLabelText('Invitation code')).toHaveAttribute('aria-invalid', 'true');
  expect(fake.stubs.auth.register).not.toHaveBeenCalled();
});

it('applies the minimum password length of the policy', async () => {
  const { fake, user } = renderRegister({ passwordMinLength: 16 });

  expect(await screen.findByText('At least 16 characters.')).toBeInTheDocument();
  await fillIdentity(user, 'fifteen-chars-x');
  await submit(user);

  expect(await screen.findByText('Use at least 16 characters.')).toBeInTheDocument();
  expect(fake.stubs.auth.register).not.toHaveBeenCalled();
});

it('validates every field before calling the server', async () => {
  const { fake, user } = renderRegister();

  await user.type(await screen.findByLabelText('Email address'), 'nope');
  await submit(user);

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  expect(screen.getAllByText('This field is required.').length).toBeGreaterThanOrEqual(2);
  expect(fake.stubs.auth.register).not.toHaveBeenCalled();
});

it.each([
  ['identity.invitation_invalid', 'Invitation code', 'This invitation is invalid', 'invite'],
  ['identity.email_taken', 'Email address', 'This email address is already in use.', 'open'],
  ['identity.identifier_invalid', 'Username', 'This username is not valid.', 'open'],
  ['identity.password_too_weak', 'Password', 'does not meet the minimum requirements', 'open'],
] as const)('shows %s on the %s field', async (code, label, text, mode) => {
  const { fake, user } = renderRegister({ mode, invite: 'tok' });
  fake.stubs.auth.register.mockRejectedValue(new EkozError({ code, status: 422 }));

  await fillIdentity(user);
  await submit(user);

  const field = await screen.findByLabelText(label);
  await vi.waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
  expect(field).toHaveAccessibleDescription(expect.stringContaining(text));
});

it('replaces the form with the closed message and refetches the policy when registration closed', async () => {
  const { fake, user } = renderRegister({ mode: 'open' });
  fake.stubs.auth.register.mockRejectedValue(
    new EkozError({ code: 'identity.registration_closed', status: 403 }),
  );

  await fillIdentity(user);
  await submit(user);

  expect(await screen.findByText(/Registration is closed/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  await vi.waitFor(() => expect(fake.stubs.auth.policy).toHaveBeenCalledTimes(2));
});

it('shows the seconds to wait after a rate limit, and stays on the form', async () => {
  const { fake, router, user } = renderRegister();
  fake.stubs.auth.register.mockRejectedValue(
    new RateLimitError({ code: 'auth.too_many_requests', status: 429, retryAfter: 20 }),
  );

  await fillIdentity(user);
  await submit(user);

  expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 20 seconds.');
  expect(router.state.location.pathname).toBe('/register');
});
