import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { ProfileSection } from '@/features/profile/components/profile-section';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const me = { ...defaultMe, bio: 'Hello' } as never;

function setup(configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['me'], me);
  const rendered = renderSignedIn(<ProfileSection me={me} />, { configure, queryClient });
  return { ...rendered, queryClient };
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('shows the current display name and biography', async () => {
  setup();

  expect(await screen.findByLabelText('Display name')).toHaveValue('Jane Doe');
  expect(screen.getByLabelText('Biography')).toHaveValue('Hello');
});

it('sends only the changed field and replaces the account in the cache', async () => {
  const { fake, user, queryClient } = setup();

  const name = await screen.findByLabelText('Display name');
  await user.clear(name);
  await user.type(name, 'Jane Smith');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await vi.waitFor(() =>
    expect(fake.stubs.me.updateProfile).toHaveBeenCalledWith({ displayName: 'Jane Smith' }),
  );
  await vi.waitFor(() =>
    expect(queryClient.getQueryData<{ displayName: string }>(['me'])?.displayName).toBe(
      'Jane Smith',
    ),
  );
  expect(toast.success).toHaveBeenCalledWith('Profile saved.');
});

it('sends an emptied biography as null', async () => {
  const { fake, user } = setup();

  await user.clear(await screen.findByLabelText('Biography'));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await vi.waitFor(() => expect(fake.stubs.me.updateProfile).toHaveBeenCalledWith({ bio: null }));
});

it('sends nothing when nothing changed', async () => {
  const { fake, user } = setup();

  await user.click(await screen.findByRole('button', { name: 'Save' }));

  expect(fake.stubs.me.updateProfile).not.toHaveBeenCalled();
});

it('does not send an empty display name', async () => {
  const { fake, user } = setup();

  await user.clear(await screen.findByLabelText('Display name'));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  expect(fake.stubs.me.updateProfile).not.toHaveBeenCalled();
});

it('shows a rejected biography under the field', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.updateProfile.mockRejectedValue(
      new EkozError({ code: 'identity.profile_invalid', status: 422 }),
    ),
  );

  const bio = await screen.findByLabelText('Biography');
  await user.type(bio, ' more');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  const error = await screen.findByText(/biography is too long/);
  expect(bio).toHaveAccessibleDescription(error.textContent ?? '');
  expect(toast.success).not.toHaveBeenCalled();
});

it('shows any other error on the form', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.updateProfile.mockRejectedValue(new Error('boom')),
  );

  await user.type(await screen.findByLabelText('Display name'), '!');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
});

it('disables the button while saving', async () => {
  const { user } = setup((fake) =>
    fake.stubs.me.updateProfile.mockReturnValue(new Promise(() => {})),
  );

  await user.type(await screen.findByLabelText('Display name'), '!');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
});
