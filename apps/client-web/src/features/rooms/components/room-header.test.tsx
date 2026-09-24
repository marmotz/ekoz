import { EkozError, type Room, type RoomListItem } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomHeader } from '@/features/rooms/components/room-header';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function renderHeader(
  room: Room | RoomListItem,
  { capabilities = [], items = [room] }: { capabilities?: string[]; items?: unknown[] } = {},
  configure?: Configure,
) {
  return renderSignedIn(<RoomHeader room={room} capabilities={capabilities} />, {
    route: `/rooms/${room.id}`,
    configure: (fake) => {
      fake.stubs.rooms.list.mockResolvedValue({ items });
      configure?.(fake);
    },
  });
}

describe('RoomHeader', () => {
  it('shows the name, topic and type of the room', async () => {
    renderHeader(roomItem({ id: 'r1', name: 'General', topic: 'Anything goes' }));

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByText('Anything goes')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
  });

  it('leaves an explicit membership and goes back to the rooms', async () => {
    const { fake, user, router } = renderHeader(roomItem({ id: 'r1', access: 'member' }));

    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    expect(fake.stubs.rooms.leave).toHaveBeenCalledWith('r1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms'));
  });

  it('shows why leaving failed', async () => {
    const { user, router } = renderHeader(roomItem({ id: 'r1' }), {}, ({ stubs }) =>
      stubs.rooms.leave.mockRejectedValue(
        new EkozError({ code: 'room.membership_not_found', status: 404 }),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not a member of this room.',
    );
    expect(router.state.location.pathname).toBe('/rooms/r1');
  });

  it('hides Leave for an inherited access', async () => {
    renderHeader(roomItem({ id: 'r1', name: 'General', access: 'inherited' }));

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
  });

  it('hides Leave for a room outside the list', async () => {
    renderHeader(roomItem({ id: 'r1', name: 'Lobby' }), { items: [] });

    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
  });

  it('lists the channels of a space', async () => {
    const space = roomItem({ id: 's1', type: 'space', name: 'Team' });
    renderHeader(space, {
      items: [
        space,
        roomItem({ id: 'c1', parentId: 's1', name: 'general' }),
        roomItem({ id: 'c2', parentId: 'other', name: 'elsewhere' }),
      ],
    });

    const channels = await screen.findByRole('navigation', { name: 'Channels' });
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'general' })).toHaveAttribute(
      'href',
      '/rooms/c1',
    );
    expect(channels).not.toHaveTextContent('elsewhere');
  });

  it('says when a space has no channel', async () => {
    renderHeader(roomItem({ id: 's1', type: 'space' }));

    expect(await screen.findByText('No channels in this space yet.')).toBeInTheDocument();
  });

  it('links moderators to the join requests', async () => {
    renderHeader(roomItem({ id: 'r1' }), { capabilities: ['room.manage_members'] });

    expect(await screen.findByRole('link', { name: 'Requests' })).toHaveAttribute(
      'href',
      '/rooms/r1/requests',
    );
  });

  it('hides the join requests without room.manage_members', async () => {
    renderHeader(roomItem({ id: 'r1', name: 'General' }), { capabilities: ['room.post'] });

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Requests' })).not.toBeInTheDocument();
  });
});
