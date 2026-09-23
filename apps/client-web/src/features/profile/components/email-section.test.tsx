import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { EmailSection } from '@/features/profile/components/email-section';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function setup(me: Record<string, unknown> = {}, configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderSignedIn(<EmailSection me={{ ...defaultMe, ...me } as never} />, {
    queryClient,
    configure,
  });
  return { ...rendered, queryClient };
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('shows the current address with a verified badge', async () => {
  setup();

  expect(await screen.findByText('jane@example.test')).toBeInTheDocument();
  expect(screen.getByText('Verified')).toBeInTheDocument();
  expect(screen.queryByText(/Verification pending/)).not.toBeInTheDocument();
});

it('flags an address that is not verified', async () => {
  setup({ emailVerified: false });

  expect(await screen.findByText('Not verified')).toBeInTheDocument();
});

it('submits the new address with the password and refetches the account', async () => {
  const { fake, user, queryClient } = setup();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await user.type(await screen.findByLabelText('New email address'), 'new@example.test');
  await user.type(screen.getByLabelText('Current password'), 'hunter2hunter2');
  await user.click(screen.getByRole('button', { name: 'Change the email address' }));

  await vi.waitFor(() =>
    expect(fake.stubs.me.changeEmail).toHaveBeenCalledWith({
      newEmail: 'new@example.test',
      password: 'hunter2hunter2',
    }),
  );
  expect(toast.success).toHaveBeenCalledWith('A verification email was sent to new@example.test.');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
  expect(screen.getByLabelText('New email address')).toHaveValue('');
});

it('rejects an invalid address without calling the server', async () => {
  const { fake, user } = setup();

  await user.type(await screen.findByLabelText('New email address'), 'nope');
  await user.type(screen.getByLabelText('Current password'), 'secret');
  await user.click(screen.getByRole('button', { name: 'Change the email address' }));

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  expect(fake.stubs.me.changeEmail).not.toHaveBeenCalled();
});

it('shows a wrong password under the password field', async () => {
  const { user } = setup({}, (fake) =>
    fake.stubs.me.changeEmail.mockRejectedValue(
      new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
    ),
  );

  await user.type(await screen.findByLabelText('New email address'), 'new@example.test');
  const password = screen.getByLabelText('Current password');
  await user.type(password, 'wrong');
  await user.click(screen.getByRole('button', { name: 'Change the email address' }));

  const error = await screen.findByText('Incorrect password.');
  expect(password).toHaveAccessibleDescription('Incorrect password.');
  expect(error).toBeInTheDocument();
});

it('shows an address already in use under the address field', async () => {
  const { user } = setup({}, (fake) =>
    fake.stubs.me.changeEmail.mockRejectedValue(
      new EkozError({ code: 'identity.email_taken', status: 409 }),
    ),
  );

  const address = await screen.findByLabelText('New email address');
  await user.type(address, 'new@example.test');
  await user.type(screen.getByLabelText('Current password'), 'secret');
  await user.click(screen.getByRole('button', { name: 'Change the email address' }));

  await screen.findByText('This email address is already in use.');
  expect(address).toHaveAccessibleDescription('This email address is already in use.');
});

it('shows the pending address and resends it with the password', async () => {
  const { fake, user } = setup({ pendingEmail: 'new@example.test' });

  expect(await screen.findByText('Verification pending for new@example.test.')).toBeInTheDocument();
  await user.type(document.getElementById('resend-email-password') as HTMLElement, 'secret');
  await user.click(screen.getByRole('button', { name: 'Resend' }));

  await vi.waitFor(() =>
    expect(fake.stubs.me.changeEmail).toHaveBeenCalledWith({
      newEmail: 'new@example.test',
      password: 'secret',
    }),
  );
  expect(toast.success).toHaveBeenCalledWith('Verification email sent again.');
});

it('shows a wrong password when resending', async () => {
  const { user } = setup({ pendingEmail: 'new@example.test' }, (fake) =>
    fake.stubs.me.changeEmail.mockRejectedValue(
      new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
    ),
  );

  await screen.findByText('Verification pending for new@example.test.');
  await user.type(document.getElementById('resend-email-password') as HTMLElement, 'wrong');
  await user.click(screen.getByRole('button', { name: 'Resend' }));

  expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
  expect(toast.success).not.toHaveBeenCalled();
});

it('asks for a password before resending', async () => {
  const { fake, user } = setup({ pendingEmail: 'new@example.test' });

  await user.click(await screen.findByRole('button', { name: 'Resend' }));

  expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  expect(fake.stubs.me.changeEmail).not.toHaveBeenCalled();
});
