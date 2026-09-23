import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { DangerZone } from '@/features/profile/components/danger-zone';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function setup(configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...renderSignedIn(<DangerZone />, { queryClient, configure }), queryClient };
}

async function openAndConfirm(user: ReturnType<typeof setup>['user'], password: string) {
  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
  await user.type(await screen.findByLabelText('Current password'), password);
  await user.click(screen.getByRole('button', { name: 'Delete the account' }));
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('only opens the dialog, without deleting anything', async () => {
  const { fake, user } = setup();

  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Your profile will be erased and your messages anonymised.',
  );
  expect(fake.stubs.me.deleteAccount).not.toHaveBeenCalled();
});

it('closes the dialog on cancel', async () => {
  const { fake, user } = setup();

  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fake.stubs.me.deleteAccount).not.toHaveBeenCalled();
});

it('requires the password', async () => {
  const { fake, user } = setup();

  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
  await user.click(await screen.findByRole('button', { name: 'Delete the account' }));

  expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  expect(fake.stubs.me.deleteAccount).not.toHaveBeenCalled();
});

it('deletes the account with the password, clears the query cache and tells the user', async () => {
  const { fake, user, queryClient } = setup();
  queryClient.setQueryData(['me'], { id: 'x' });
  queryClient.setQueryData(['account', 'sessions'], []);

  await openAndConfirm(user, 'secret');

  await vi.waitFor(() =>
    expect(fake.stubs.me.deleteAccount).toHaveBeenCalledWith({ password: 'secret' }),
  );
  await vi.waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  expect(toast.success).toHaveBeenCalledWith('Your account was deleted.');
});

it('shows a wrong password under the field and keeps the cache', async () => {
  const { user, queryClient } = setup((fake) =>
    fake.stubs.me.deleteAccount.mockRejectedValue(
      new EkozError({ code: 'auth.invalid_credentials', status: 401 }),
    ),
  );
  queryClient.setQueryData(['me'], { id: 'x' });

  await openAndConfirm(user, 'wrong');

  await screen.findByText('Incorrect password.');
  expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription(
    'Incorrect password.',
  );
  expect(queryClient.getQueryData(['me'])).toEqual({ id: 'x' });
  expect(toast.success).not.toHaveBeenCalled();
});

it('tells the only owner to promote another owner first', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.deleteAccount.mockRejectedValue(
      new EkozError({ code: 'identity.last_owner', status: 409 }),
    ),
  );

  await openAndConfirm(user, 'secret');

  expect(
    await screen.findByText(
      'You are the only owner: promote another owner in the admin console first.',
    ),
  ).toBeInTheDocument();
});

it('disables the confirm button while deleting', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.deleteAccount.mockReturnValue(new Promise(() => {})),
  );

  await openAndConfirm(user, 'secret');

  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Delete the account' })).toBeDisabled(),
  );
});

it('forgets a previous error when the dialog is reopened', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.deleteAccount.mockRejectedValue(new Error('boom')),
  );

  await openAndConfirm(user, 'secret');
  await screen.findByText('Something went wrong. Try again.');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(await screen.findByRole('button', { name: 'Delete my account' }));

  await screen.findByLabelText('Current password');
  expect(screen.queryByText('Something went wrong. Try again.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current password')).toHaveValue('');
});
