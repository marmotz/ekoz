import { EkozError, type Room, type RoomListItem } from '@ekozhq/sdk';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomHeader } from '@/features/rooms/components/room-header';
import { resetPresence, setPresence } from '@/shared/realtime/presence-store';
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

  it('renders the controls another feature passes in the actions slot', async () => {
    renderSignedIn(
      <RoomHeader
        room={roomItem({ id: 'r1', name: 'General' })}
        capabilities={[]}
        actions={<button type="button">Extra action</button>}
      />,
      { route: '/rooms/r1' },
    );

    expect(await screen.findByRole('button', { name: 'Extra action' })).toBeInTheDocument();
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

  it('links to the groups with room.manage_groups', async () => {
    renderHeader(roomItem({ id: 'r1' }), { capabilities: ['room.manage_groups'] });

    expect(await screen.findByRole('link', { name: 'Groups' })).toHaveAttribute(
      'href',
      '/rooms/r1/groups',
    );
  });

  it('hides the groups without room.manage_groups', async () => {
    renderHeader(roomItem({ id: 'r1', name: 'General' }), {
      capabilities: ['room.manage_members'],
    });

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Groups' })).not.toBeInTheDocument();
  });
});

describe('RoomHeader direct conversation presence', () => {
  const member = (id: string, name: string) => ({
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id, identifier: `${name}/example.test`, displayName: name, avatarUrl: null },
  });
  const withPartner: Configure = ({ stubs }) => {
    stubs.me.get.mockResolvedValue({ id: 'me', displayName: 'Jane' } as never);
    stubs.rooms.members.mockResolvedValue({
      items: [member('me', 'jane'), member('u2', 'alice')],
      nextCursor: null,
    } as never);
  };

  beforeEach(() => {
    resetPresence();
  });

  it('shows the presence of the other participant of a dm, following the store', async () => {
    const room = roomItem({ id: 'd1', name: 'Alice', type: 'dm' });
    renderHeader(room, {}, withPartner);

    expect(await screen.findByRole('img', { name: 'Offline' })).toBeInTheDocument();

    act(() => setPresence('u2', 'online'));

    expect(await screen.findByRole('img', { name: 'Online' })).toBeInTheDocument();
  });

  it('shows no dot for a channel, and does not load its members', async () => {
    const { fake } = renderHeader(roomItem({ id: 'r1', name: 'General' }));

    await screen.findByRole('heading', { name: 'General' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(fake.stubs.rooms.members).not.toHaveBeenCalled();
  });

  it('shows no dot for a group conversation', async () => {
    renderHeader(roomItem({ id: 'g1', name: 'Team', type: 'group_dm' }), {}, withPartner);

    await screen.findByRole('heading', { name: 'Team' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
