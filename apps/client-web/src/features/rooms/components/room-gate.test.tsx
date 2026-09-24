import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomGate } from '@/features/rooms/components/room-gate';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function renderGate(configure?: Configure) {
  return renderSignedIn(
    <RoomGate roomId="r1">
      {({ room, capabilities, membership }) => (
        <p data-testid="content">{`${room.id}|${room.name}|${capabilities.join(',')}|${membership}`}</p>
      )}
    </RoomGate>,
    { configure },
  );
}

const forbidden = () => new EkozError({ code: 'room.permission_denied', status: 403 });
const notFound = () => new EkozError({ code: 'room.not_found', status: 404 });
const invitation = {
  id: 'i1',
  role: 'member',
  createdAt: '2026-01-01T00:00:00.000Z',
  room: { id: 'r1', type: 'channel', name: 'Secret', topic: null, visibility: 'invite' },
  invitedBy: { id: 'u2', identifier: 'bob/example.test', displayName: 'Bob', avatarUrl: null },
};

describe('RoomGate', () => {
  it('shows a loading state while the rooms load', async () => {
    renderGate(({ stubs }) => stubs.rooms.list.mockReturnValue(new Promise(() => {})));

    expect(await screen.findByRole('status', { name: 'Loading the room' })).toBeInTheDocument();
  });

  it.each(['member', 'inherited'] as const)(
    'renders the content of a listed %s room without fetching it again',
    async (access) => {
      const { fake } = renderGate(({ stubs }) => {
        stubs.rooms.list.mockResolvedValue({
          items: [roomItem({ id: 'r1', name: 'General', access })],
        });
        stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read', 'room.post'] });
      });

      expect(await screen.findByTestId('content')).toHaveTextContent(
        'r1|General|room.read,room.post|member',
      );
      expect(fake.stubs.rooms.get).not.toHaveBeenCalled();
      expect(fake.stubs.rooms.myPermissions).toHaveBeenCalledWith('r1');
    },
  );

  it('does not treat a context ancestor as a membership', async () => {
    const { fake } = renderGate(({ stubs }) => {
      stubs.rooms.list.mockResolvedValue({ items: [roomItem({ id: 'r1', access: 'context' })] });
      stubs.rooms.get.mockRejectedValue(notFound());
    });

    expect(await screen.findByText('Room unavailable')).toBeInTheDocument();
    expect(fake.stubs.rooms.get).toHaveBeenCalledWith('r1');
  });

  it('keeps the content readable when the capabilities cannot be loaded', async () => {
    renderGate(({ stubs }) => {
      stubs.rooms.list.mockResolvedValue({ items: [roomItem({ id: 'r1', name: 'General' })] });
      stubs.rooms.myPermissions.mockRejectedValue(new Error('boom'));
    });

    expect(await screen.findByTestId('content')).toHaveTextContent('r1|General||member');
  });

  describe('with a pending invitation', () => {
    const configure: Configure = ({ stubs }) => {
      stubs.roomInvitations.listMine.mockResolvedValue({ items: [invitation] });
      stubs.rooms.get.mockResolvedValue({
        id: 'r1',
        name: 'Secret',
        visibility: 'invite',
      } as never);
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read'] });
    };

    it('renders the content read-only under an Accept / Decline banner', async () => {
      renderGate(configure);

      expect(await screen.findByTestId('content')).toHaveTextContent('r1|Secret|room.read|invited');
      expect(screen.getByText('You are invited to join Secret.')).toBeInTheDocument();
    });

    it('accepts the invitation', async () => {
      const { fake, user } = renderGate(configure);

      await user.click(await screen.findByRole('button', { name: 'Accept' }));

      expect(fake.stubs.roomInvitations.accept).toHaveBeenCalledWith('i1');
    });

    it('declines the invitation', async () => {
      const { fake, user } = renderGate(configure);

      await user.click(await screen.findByRole('button', { name: 'Decline' }));

      expect(fake.stubs.roomInvitations.decline).toHaveBeenCalledWith('i1');
    });

    it('shows why an answer failed', async () => {
      const { user } = renderGate((fake) => {
        configure(fake);
        fake.stubs.roomInvitations.accept.mockRejectedValue(
          new EkozError({ code: 'room.invitation_already_resolved', status: 409 }),
        );
      });

      await user.click(await screen.findByRole('button', { name: 'Accept' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This invitation has already been answered.',
      );
    });
  });

  describe('for a public room the caller is not in', () => {
    const configure: Configure = ({ stubs }) => {
      stubs.rooms.get.mockResolvedValue({ id: 'r1', name: 'Lobby', visibility: 'public' } as never);
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read'] });
    };

    it('renders the content read-only under a Join banner', async () => {
      renderGate(configure);

      expect(await screen.findByTestId('content')).toHaveTextContent('r1|Lobby|room.read|joinable');
      expect(screen.getByText('Lobby is a public room: join it to take part.')).toBeInTheDocument();
    });

    it('joins the room and refreshes the list', async () => {
      const { fake, user } = renderGate(configure);

      await user.click(await screen.findByRole('button', { name: 'Join' }));

      expect(fake.stubs.rooms.join).toHaveBeenCalledWith('r1');
      await waitFor(() => expect(fake.stubs.rooms.list).toHaveBeenCalledTimes(2));
    });

    it('refreshes the list silently when the caller already is a member', async () => {
      const { fake, user } = renderGate((fake) => {
        configure(fake);
        fake.stubs.rooms.join.mockRejectedValue(
          new EkozError({ code: 'room.already_member', status: 409 }),
        );
      });

      await user.click(await screen.findByRole('button', { name: 'Join' }));

      await waitFor(() => expect(fake.stubs.rooms.list).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows that the caller is banned', async () => {
      const { user } = renderGate((fake) => {
        configure(fake);
        fake.stubs.rooms.join.mockRejectedValue(
          new EkozError({ code: 'room.banned', status: 403 }),
        );
      });

      await user.click(await screen.findByRole('button', { name: 'Join' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('You are banned from this room.');
    });
  });

  describe('for an invite-only room the caller cannot read', () => {
    const withPreview =
      (joinRequest: unknown): Configure =>
      ({ stubs }) => {
        stubs.rooms.get.mockRejectedValue(forbidden());
        stubs.rooms.preview.mockResolvedValue({
          id: 'r1',
          type: 'channel',
          name: 'Staff',
          topic: 'Staff only',
          joinRequest,
        } as never);
      };

    it('falls back to the preview and offers to request to join', async () => {
      const { fake, user } = renderGate(withPreview(null));

      expect(await screen.findByRole('heading', { name: 'Staff' })).toBeInTheDocument();
      expect(screen.getByText('Staff only')).toBeInTheDocument();
      expect(fake.stubs.rooms.preview).toHaveBeenCalledWith('r1');
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      expect(fake.stubs.rooms.myPermissions).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Request to join' }));

      expect(fake.stubs.rooms.requestToJoin).toHaveBeenCalledWith('r1');
      await waitFor(() => expect(fake.stubs.rooms.preview).toHaveBeenCalledTimes(2));
    });

    it.each([
      ['pending', 'Request pending: a moderator will review it.'],
      ['rejected', 'Your request to join was declined.'],
    ])('shows a %s request', async (status, text) => {
      renderGate(withPreview({ id: 'q1', createdAt: '2026-01-01T00:00:00Z', status }));

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument();
    });

    it('shows why a request failed', async () => {
      const { user } = renderGate((fake) => {
        withPreview(null)(fake);
        fake.stubs.rooms.requestToJoin.mockRejectedValue(
          new EkozError({ code: 'room.join_request_already_exists', status: 409 }),
        );
      });

      await user.click(await screen.findByRole('button', { name: 'Request to join' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You already asked to join this room.',
      );
    });
  });

  describe('is neutral about a room that cannot be reached', () => {
    it.each<[string, Configure]>([
      ['not found', ({ stubs }) => stubs.rooms.get.mockRejectedValue(notFound())],
      [
        'forbidden without preview',
        ({ stubs }) => {
          stubs.rooms.get.mockRejectedValue(forbidden());
          stubs.rooms.preview.mockRejectedValue(notFound());
        },
      ],
      [
        'readable but neither public nor invited',
        ({ stubs }) =>
          stubs.rooms.get.mockResolvedValue({ id: 'r1', visibility: 'private' } as never),
      ],
    ])('%s', async (_case, configure) => {
      renderGate(configure);

      expect(await screen.findByText('Room unavailable')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to rooms' })).toHaveAttribute('href', '/rooms');
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    });
  });

  it('offers a retry when the rooms cannot be loaded', async () => {
    const { fake, user } = renderGate(({ stubs }) =>
      stubs.rooms.list.mockRejectedValueOnce(new Error('boom')),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(fake.stubs.rooms.list).toHaveBeenCalledTimes(2));
  });

  it('offers a retry when the room cannot be loaded', async () => {
    const { fake, user } = renderGate(({ stubs }) =>
      stubs.rooms.get.mockRejectedValueOnce(new EkozError({ code: 'server.error', status: 500 })),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(fake.stubs.rooms.get).toHaveBeenCalledTimes(2));
  });

  it('renders in French', async () => {
    const { i18n } = renderGate(({ stubs }) => stubs.rooms.get.mockRejectedValue(notFound()));
    await i18n.changeLanguage('fr');

    expect(await screen.findByText('Salon indisponible')).toBeInTheDocument();
  });
});
