import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitationList } from '@/features/rooms/components/invitation-list';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function invitation(id: string, invitedBy: Partial<Record<string, string | null>> = {}) {
  return {
    id,
    role: 'moderator',
    createdAt: '2026-03-14T10:00:00.000Z',
    room: {
      id: `r-${id}`,
      type: 'channel',
      name: `Room ${id}`,
      topic: null,
      visibility: 'invite',
    },
    invitedBy: {
      id: 'u1',
      identifier: 'bob/example.test',
      displayName: 'Bob',
      avatarUrl: null,
      ...invitedBy,
    },
  };
}

const withInvitations =
  (...items: unknown[]): Configure =>
  ({ stubs }) =>
    stubs.roomInvitations.listMine.mockResolvedValue({ items } as never);

function renderList(configure?: Configure) {
  return renderSignedIn(<InvitationList />, { configure, route: '/rooms/invitations' });
}

describe('InvitationList', () => {
  it('shows an empty state', async () => {
    renderList(withInvitations());

    expect(await screen.findByText('No pending invitation.')).toBeInTheDocument();
  });

  it('lists the room, its type, the inviter, the role and the date', async () => {
    renderList(withInvitations(invitation('i1')));

    const row = (await screen.findByText('Room i1')).closest('li') as HTMLElement;
    expect(within(row).getByText('Channel')).toBeInTheDocument();
    expect(within(row).getByText(/Invited by Bob/)).toBeInTheDocument();
    expect(within(row).getByText(/bob\/example\.test/)).toBeInTheDocument();
    expect(within(row).getByText(/as moderator/)).toBeInTheDocument();
    expect(within(row).getByText(/on Mar 14, 2026/)).toBeInTheDocument();
  });

  it('labels an inviter whose account was deleted', async () => {
    renderList(
      withInvitations(invitation('i1', { identifier: null, displayName: null, avatarUrl: null })),
    );

    expect(await screen.findByText(/Invited by Deleted account/)).toBeInTheDocument();
  });

  it('accepts an invitation, refreshes the lists and opens the room', async () => {
    const { fake, user, router } = renderList(withInvitations(invitation('i1')));

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(fake.stubs.roomInvitations.accept).toHaveBeenCalledWith('i1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms/r-i1'));
    await waitFor(() => expect(fake.stubs.roomInvitations.listMine).toHaveBeenCalledTimes(2));
  });

  it('declines an invitation and drops its row', async () => {
    const { fake, user, router } = renderList(({ stubs }) =>
      stubs.roomInvitations.listMine
        .mockResolvedValueOnce({ items: [invitation('i1')] } as never)
        .mockResolvedValue({ items: [] } as never),
    );

    await user.click(await screen.findByRole('button', { name: 'Decline' }));

    expect(fake.stubs.roomInvitations.decline).toHaveBeenCalledWith('i1');
    expect(await screen.findByText('No pending invitation.')).toBeInTheDocument();
    expect(screen.queryByText('Room i1')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rooms/invitations');
  });

  it('refreshes the list and explains an invitation answered elsewhere', async () => {
    const { fake, user, router } = renderList(({ stubs }) => {
      stubs.roomInvitations.listMine
        .mockResolvedValueOnce({ items: [invitation('i1')] } as never)
        .mockResolvedValue({ items: [] } as never);
      stubs.roomInvitations.accept.mockRejectedValue(
        new EkozError({ code: 'room.invitation_already_resolved', status: 409 }),
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invitation has already been answered.',
    );
    await waitFor(() => expect(fake.stubs.roomInvitations.listMine).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No pending invitation.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rooms/invitations');
  });

  it('maps any other error', async () => {
    const { user } = renderList((fake) => {
      withInvitations(invitation('i1'))(fake);
      fake.stubs.roomInvitations.decline.mockRejectedValue(
        new EkozError({ code: 'room.banned', status: 403 }),
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Decline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You are banned from this room.');
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const { fake, user } = renderList(({ stubs }) =>
      stubs.roomInvitations.listMine
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ items: [] } as never),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No pending invitation.')).toBeInTheDocument();
    expect(fake.stubs.roomInvitations.listMine).toHaveBeenCalledTimes(2);
  });
});
