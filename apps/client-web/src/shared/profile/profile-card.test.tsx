import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { ProfileCard, ProfileCardPopover } from '@/shared/profile/profile-card';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../test/render';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@/shared/ui/popover', () => import('../../../test/popover-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const moderator = 'moderator';
const reader = 'reader';
const fallback = { displayName: 'Bob (fallback)', avatarUrl: null };

function setup(configure?: (fake: ReturnType<typeof createFakeSdk>) => void) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  configure?.(fake);
  createClientMock.mockReturnValue(fake.sdk);
  return fake;
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows the fallback name and identifier at once, then the loaded bio', async () => {
  let release: (profile: unknown) => void = () => {};
  const fake = setup((f) => {
    f.stubs.users.getProfile.mockImplementation(
      () => new Promise((resolve) => (release = resolve)) as never,
    );
  });

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} />
    </SdkProvider>,
  );

  expect(await screen.findByText('Bob (fallback)')).toBeInTheDocument();
  expect(screen.getByText('bob/example.test')).toBeInTheDocument();
  expect(await screen.findByRole('status', { name: 'Loading the profile' })).toBeInTheDocument();
  await waitFor(() => expect(fake.stubs.users.getProfile).toHaveBeenCalledWith('bob/example.test'));

  release({
    identifier: 'bob/example.test',
    displayName: 'Bob',
    bio: 'I like tea.',
    avatarUrl: null,
  });

  expect(await screen.findByText('I like tea.')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps the fallback without a bio when the profile is not found', async () => {
  const fake = setup((f) => {
    f.stubs.users.getProfile.mockRejectedValue(
      new EkozError({ code: 'identity.profile_not_found', status: 404 }),
    );
  });

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} />
    </SdkProvider>,
  );

  await waitFor(() => expect(fake.stubs.users.getProfile).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByText('Bob (fallback)')).toBeInTheDocument();
  expect(screen.getByText('bob/example.test')).toBeInTheDocument();
});

it('shows no bio line for a profile without a bio', async () => {
  setup((f) => {
    f.stubs.users.getProfile.mockResolvedValue({
      identifier: 'bob/example.test',
      displayName: 'Bob',
      bio: null,
      avatarUrl: null,
    } as never);
  });

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} />
    </SdkProvider>,
  );

  expect(await screen.findByText('Bob')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText('Role: Member')).not.toBeInTheDocument();
});

it('shows the role of a room member', async () => {
  setup();

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} role={moderator} />
    </SdkProvider>,
  );

  expect(await screen.findByText('Role: Moderator')).toBeInTheDocument();
  expect(screen.queryByText('Left the room')).not.toBeInTheDocument();
});

it('shows the left-the-room note, without a role, for someone who left', async () => {
  setup();

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} left />
    </SdkProvider>,
  );

  expect(await screen.findByText('Left the room')).toBeInTheDocument();
  expect(screen.queryByText(/^Role:/)).not.toBeInTheDocument();
});

it('shows French labels', async () => {
  setup();

  renderWithProviders(
    <SdkProvider>
      <ProfileCard identifier="bob/example.test" fallback={fallback} role={reader} left />
    </SdkProvider>,
    { language: 'fr' },
  );

  expect(await screen.findByText('Rôle: Lecteur')).toBeInTheDocument();
  expect(screen.getByText('A quitté le salon')).toBeInTheDocument();
});

it('mounts the card, and its query, only once the popover is opened', async () => {
  const fake = setup();

  const user = userEvent.setup();
  renderWithProviders(
    <SdkProvider>
      <ProfileCardPopover identifier="bob/example.test" fallback={fallback}>
        <button type="button">Bob</button>
      </ProfileCardPopover>
    </SdkProvider>,
  );

  const trigger = await screen.findByRole('button', { name: 'Bob' });
  await waitFor(() => expect(fake.stubs.session.resume).toHaveBeenCalled());
  expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();
  expect(screen.queryByText('bob/example.test')).not.toBeInTheDocument();

  await user.click(trigger);

  expect(await screen.findByText('bob/example.test')).toBeInTheDocument();
  await waitFor(() => expect(fake.stubs.users.getProfile).toHaveBeenCalledWith('bob/example.test'));
});
