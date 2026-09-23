import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { PasswordSection } from '@/features/profile/components/password-section';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function setup(configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...renderSignedIn(<PasswordSection />, { queryClient, configure }), queryClient };
}

async function fill(user: ReturnType<typeof setup>['user'], current: string, next: string) {
  await user.type(await screen.findByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.click(screen.getByRole('button', { name: 'Change the password' }));
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('has no confirmation field', async () => {
  setup();

  await screen.findByLabelText('Current password');
  expect(screen.queryByLabelText(/confirm/i)).not.toBeInTheDocument();
});

it('changes the password, tells about the other devices, invalidates the sessions and clears the fields', async () => {
  const { fake, user, queryClient } = setup();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await fill(user, 'old-password', 'new-password-1');

  await vi.waitFor(() =>
    expect(fake.stubs.me.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    }),
  );
  expect(toast.success).toHaveBeenCalledWith(
    'Password changed. Your other devices were signed out.',
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'sessions'] });
  expect(screen.getByLabelText('Current password')).toHaveValue('');
  expect(screen.getByLabelText('New password')).toHaveValue('');
});

it('requires both passwords', async () => {
  const { fake, user } = setup();

  await user.click(await screen.findByRole('button', { name: 'Change the password' }));

  expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
  expect(fake.stubs.me.changePassword).not.toHaveBeenCalled();
});

it('shows a wrong current password under its field and does not sign out', async () => {
  const { fake, user } = setup((f) =>
    f.stubs.me.changePassword.mockRejectedValue(
      new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
    ),
  );

  await fill(user, 'wrong', 'new-password-1');

  await screen.findByText('Incorrect password.');
  expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription(
    'Incorrect password.',
  );
  expect(fake.stubs.auth.logout).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it('shows a weak password under the new password field', async () => {
  const { user } = setup((f) =>
    f.stubs.me.changePassword.mockRejectedValue(
      new EkozError({ code: 'identity.password_too_weak', status: 422 }),
    ),
  );

  await fill(user, 'old-password', 'weak');

  await screen.findByText('This password does not meet the minimum requirements.');
  expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
    'This password does not meet the minimum requirements.',
  );
});

it('shows any other error on the form and keeps the fields', async () => {
  const { user } = setup((f) => f.stubs.me.changePassword.mockRejectedValue(new Error('boom')));

  await fill(user, 'old-password', 'new-password-1');

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  expect(screen.getByLabelText('New password')).toHaveValue('new-password-1');
});

it('disables the button while the request runs', async () => {
  const { user } = setup((f) => f.stubs.me.changePassword.mockReturnValue(new Promise(() => {})));

  await fill(user, 'old-password', 'new-password-1');

  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Change the password' })).toBeDisabled(),
  );
});
