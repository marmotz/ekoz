import { EkozError } from '@ekozhq/sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';
import { AvatarEditor } from '@/features/profile/components/avatar-editor';
import { useMe } from '@/shared/sdk/use-me';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

/** Reads the account like the page does, so a cache update reaches the editor. */
function Editor() {
  const me = useMe();
  return me.data ? <AvatarEditor me={me.data} /> : null;
}

const withAvatar = { ...defaultMe, avatarUrl: 'http://localhost:3010/users/jane/avatar?v=1' };
const image = new File(['x'], 'me.png', { type: 'image/png' });

function setup(me: typeof defaultMe, configure?: Configure) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['me'], me);
  return {
    ...renderSignedIn(<Editor />, {
      configure: (fake) => {
        fake.stubs.me.get.mockResolvedValue(me);
        configure?.(fake);
      },
      queryClient,
    }),
    queryClient,
  };
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast.success).mockClear();
});

it('only accepts the image types the server takes', async () => {
  setup(defaultMe);

  expect(await screen.findByLabelText('Avatar image')).toHaveAttribute(
    'accept',
    'image/png,image/jpeg,image/webp,image/gif',
  );
});

it('shows the initials as preview and offers no removal without avatar', async () => {
  setup(defaultMe);

  expect(await screen.findByText('JD')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
});

it('keeps the upload button disabled until a file is chosen', async () => {
  setup(defaultMe);

  expect(await screen.findByRole('button', { name: 'Upload' })).toBeDisabled();
});

it('uploads the file and replaces the avatar url in the cache', async () => {
  const { fake, user, queryClient } = setup(defaultMe);

  await user.upload(await screen.findByLabelText('Avatar image'), image);
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await vi.waitFor(() => expect(fake.stubs.me.setAvatar).toHaveBeenCalledWith(image));
  await vi.waitFor(() =>
    expect(queryClient.getQueryData<{ avatarUrl: string }>(['me'])?.avatarUrl).toBe(
      'http://localhost:3010/users/jane/avatar?v=2',
    ),
  );
  expect(toast.success).toHaveBeenCalledWith('Avatar updated.');
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
});

it('removes the avatar and clears the url in the cache', async () => {
  const { fake, user, queryClient } = setup(withAvatar);

  await user.click(await screen.findByRole('button', { name: 'Remove' }));

  await vi.waitFor(() => expect(fake.stubs.me.deleteAvatar).toHaveBeenCalledTimes(1));
  await vi.waitFor(() =>
    expect(queryClient.getQueryData<{ avatarUrl: null }>(['me'])?.avatarUrl).toBeNull(),
  );
  expect(toast.success).toHaveBeenCalledWith('Avatar removed.');
});

it.each([
  ['identity.avatar_too_large', 'This image is too large.'],
  [
    'identity.avatar_rejected',
    'This image could not be used. Choose a PNG, JPEG, WebP or GIF file.',
  ],
])('shows %s', async (code, message) => {
  const { user } = setup(defaultMe, (fake) =>
    fake.stubs.me.setAvatar.mockRejectedValue(new EkozError({ code, status: 422 })),
  );

  await user.upload(await screen.findByLabelText('Avatar image'), image);
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  expect(await screen.findByText(message)).toBeInTheDocument();
});

it('disables both buttons while uploading', async () => {
  const { user } = setup(withAvatar, (fake) =>
    fake.stubs.me.setAvatar.mockReturnValue(new Promise(() => {})),
  );

  await user.upload(await screen.findByLabelText('Avatar image'), image);
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
});

it('shows the new avatar in place of the old one', async () => {
  const { fake, user } = setup(withAvatar);
  await vi.waitFor(() =>
    expect(fake.stubs.users.avatar).toHaveBeenCalledWith('jane/example.test', { version: '1' }),
  );

  await user.upload(await screen.findByLabelText('Avatar image'), image);
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await vi.waitFor(() =>
    expect(fake.stubs.users.avatar).toHaveBeenCalledWith('jane/example.test', { version: '2' }),
  );
});
