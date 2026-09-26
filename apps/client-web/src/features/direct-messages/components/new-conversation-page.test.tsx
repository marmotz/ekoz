import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewConversationPage } from '@/features/direct-messages/components/new-conversation-page';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const contact = (id: string, name: string) => ({
  id,
  identifier: `${name.toLowerCase()}/example.test`,
  displayName: name,
  avatarUrl: null,
});

function render(configure?: Configure) {
  return renderSignedIn(<NewConversationPage />, {
    route: '/dms/new',
    configure: (fake) => {
      fake.stubs.conversations.searchContacts.mockResolvedValue({
        items: [contact('u2', 'Bob'), contact('u3', 'Carol')],
      });
      configure?.(fake);
    },
  });
}

async function pick(user: ReturnType<typeof render>['user'], name: string) {
  const search = await screen.findByRole('searchbox', { name: 'Search people' });
  await user.type(search, name.toLowerCase().slice(0, 2));
  await user.click(await screen.findByRole('button', { name: `Add ${name}` }));
}

describe('NewConversationPage', () => {
  it('starts a dm with one person and opens it', async () => {
    const { fake, user, router, queryClient } = render();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await pick(user, 'Bob');
    expect(screen.queryByLabelText('Group name (optional)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(fake.stubs.conversations.createDm).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dms/dm-u2'));
    expect(fake.stubs.conversations.createGroup).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] });
  });

  it('creates a group from two people, with an optional name', async () => {
    const { fake, user, router } = render();

    await pick(user, 'Bob');
    await pick(user, 'Carol');
    await user.type(screen.getByLabelText('Group name (optional)'), '  Trip  ');
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.createGroup).toHaveBeenCalledWith({
        userIds: ['u2', 'u3'],
        name: 'Trip',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/dms/group'));
    expect(fake.stubs.conversations.createDm).not.toHaveBeenCalled();
  });

  it('omits the name of a group when it is left empty', async () => {
    const { fake, user } = render();

    await pick(user, 'Bob');
    await pick(user, 'Carol');
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() =>
      expect(fake.stubs.conversations.createGroup).toHaveBeenCalledWith({ userIds: ['u2', 'u3'] }),
    );
  });

  it('cannot submit without anybody picked', async () => {
    render();

    expect(await screen.findByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('never offers the caller', async () => {
    const { user } = render(({ stubs }) =>
      stubs.conversations.searchContacts.mockResolvedValue({
        items: [contact(defaultMe.id, 'Jane'), contact('u2', 'Bob')],
      }),
    );

    await user.type(await screen.findByRole('searchbox', { name: 'Search people' }), 'ja');

    expect(await screen.findByRole('button', { name: 'Add Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Jane' })).not.toBeInTheDocument();
  });

  it.each([
    ['room.user_not_found', 'One of these people does not exist or is not active.'],
    ['room.dm_self', 'You cannot start a conversation with yourself.'],
    ['room.group_full', 'This group has reached its maximum number of members.'],
  ])('maps %s to a message', async (code, message) => {
    const { user, router } = render(({ stubs }) => {
      const error = new EkozError({ code, status: 422 });
      stubs.conversations.createDm.mockRejectedValue(error);
      stubs.conversations.createGroup.mockRejectedValue(error);
    });

    await pick(user, 'Bob');
    if (code === 'room.group_full') await pick(user, 'Carol');
    await user.click(
      screen.getByRole('button', { name: code === 'room.group_full' ? 'Create group' : 'Start' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe('/dms/new');
  });
});
