import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupSettingsPage } from '@/features/direct-messages/components/group-settings-page';
import { conversationItem, participant } from '../../../../test/conversation-fixtures';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const ADMIN_CAPABILITIES = ['room.read', 'room.post', 'room.manage_members'];

function render({
  admin = true,
  otherAdmin = false,
  type = 'group_dm',
  configure,
}: {
  admin?: boolean;
  otherAdmin?: boolean;
  type?: 'dm' | 'group_dm';
  configure?: Configure;
} = {}) {
  return renderSignedIn(<GroupSettingsPage roomId="g1" />, {
    route: '/dms/g1/settings',
    configure: (fake) => {
      fake.stubs.conversations.list.mockResolvedValue({
        items: [
          conversationItem({
            id: 'g1',
            type,
            name: 'Trip',
            isAdmin: admin,
            participants: [
              participant('u2', 'Bob', { isAdmin: otherAdmin }),
              participant('u3', 'Carol'),
            ],
          }),
        ],
      });
      fake.stubs.rooms.myPermissions.mockResolvedValue({
        capabilities: admin ? ADMIN_CAPABILITIES : ['room.read', 'room.post'],
      });
      fake.stubs.conversations.searchContacts.mockResolvedValue({
        items: [{ id: 'u4', identifier: 'dan/example.test', displayName: 'Dan', avatarUrl: null }],
      });
      configure?.(fake);
    },
  });
}

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('GroupSettingsPage', () => {
  it('lists the participants and the caller, with the admin badges', async () => {
    render({ otherAdmin: true });

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(within(row('Bob')).getByText('Admin')).toBeInTheDocument();
    expect(within(row('Carol')).queryByText('Admin')).not.toBeInTheDocument();
    const self = (await screen.findByText(/Jane Doe/)).closest('li') as HTMLElement;
    expect(within(self).getByText('Admin')).toBeInTheDocument();
    expect(within(self).getByText('(you)', { exact: false })).toBeInTheDocument();
  });

  it('gives an admin every management control', async () => {
    render();

    expect(await screen.findByLabelText('Group name')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Bob from the group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make Bob an admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give up admin role' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave the group' })).toBeInTheDocument();
  });

  it('gives a plain member the participant list and the leave button only', async () => {
    render({ admin: false, otherAdmin: true });

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Bob/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave the group' })).toBeInTheDocument();
  });

  it('renames the group, or clears its name', async () => {
    const { fake, user } = render();

    const input = await screen.findByLabelText('Group name');
    await user.clear(input);
    await user.type(input, '  Holidays ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fake.stubs.conversations.rename).toHaveBeenCalledWith('g1', 'Holidays'),
    );

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fake.stubs.conversations.rename).toHaveBeenLastCalledWith('g1', null),
    );
  });

  it('promotes and demotes a participant', async () => {
    const { fake, user } = render({ otherAdmin: true });

    await user.click(await screen.findByRole('button', { name: 'Remove Bob as admin' }));
    await waitFor(() =>
      expect(fake.stubs.conversations.revokeAdmin).toHaveBeenCalledWith('g1', 'u2'),
    );

    await user.click(screen.getByRole('button', { name: 'Make Carol an admin' }));
    await waitFor(() =>
      expect(fake.stubs.conversations.grantAdmin).toHaveBeenCalledWith('g1', 'u3'),
    );
  });

  it('removes a participant', async () => {
    const { fake, user } = render();

    await user.click(await screen.findByRole('button', { name: 'Remove Carol from the group' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.removeMember).toHaveBeenCalledWith('g1', 'u3'),
    );
  });

  it('adds members showing the past messages by default', async () => {
    const { fake, user } = render();

    await user.type(await screen.findByRole('searchbox', { name: 'Search people to add' }), 'da');
    await user.click(await screen.findByRole('button', { name: 'Add Dan' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.addMembers).toHaveBeenCalledWith('g1', {
        userIds: ['u4'],
        history: 'full',
      }),
    );
  });

  it('adds members without the past messages when the choice is cleared', async () => {
    const { fake, user } = render();

    await user.type(await screen.findByRole('searchbox', { name: 'Search people to add' }), 'da');
    await user.click(await screen.findByRole('button', { name: 'Add Dan' }));
    await user.click(screen.getByLabelText('Show past messages to the new members'));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.addMembers).toHaveBeenCalledWith('g1', {
        userIds: ['u4'],
        history: 'none',
      }),
    );
  });

  it('leaves the group after a confirmation and goes home', async () => {
    const { fake, user, router } = render({ otherAdmin: true });

    await user.click(await screen.findByRole('button', { name: 'Leave the group' }));
    expect(screen.queryByText(/deleted for everyone/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(fake.stubs.rooms.leave).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('warns the only admin that leaving deletes the group for everyone', async () => {
    const { user } = render();

    await user.click(await screen.findByRole('button', { name: 'Leave the group' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are the only admin: the group will be deleted for everyone.',
    );
  });

  it('gives up the admin role with the same warning, and goes home when it was the last one', async () => {
    const { fake, user, router } = render();

    await user.click(await screen.findByRole('button', { name: 'Give up admin role' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('deleted for everyone');
    await user.click(screen.getByRole('button', { name: 'Give up' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.revokeAdmin).toHaveBeenCalledWith('g1', defaultMe.id),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('gives up the admin role without leaving the page when another admin remains', async () => {
    const { fake, user, router } = render({ otherAdmin: true });

    await user.click(await screen.findByRole('button', { name: 'Give up admin role' }));
    expect(screen.queryByText(/deleted for everyone/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Give up' }));

    await waitFor(() => expect(fake.stubs.conversations.revokeAdmin).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/dms/g1/settings');
  });

  it('redirects a dm to the conversation', async () => {
    const { router } = render({ type: 'dm' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/dms/g1'));
  });
});
