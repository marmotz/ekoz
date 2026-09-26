import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomGroups } from '@/features/rooms/components/room-groups';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const group = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  nodeId: 'r1',
  name,
  memberCount: 2,
  inherited: false,
  isMember: false,
  ...overrides,
});

const user = (id: string, displayName: string | null) => ({
  id,
  identifier: displayName ? `${id}/example.test` : null,
  displayName,
  avatarUrl: null,
});

const roomMember = (id: string, displayName: string) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: user(id, displayName),
});

function renderGroups(configure?: Configure, capabilities = ['room.manage_groups']) {
  return renderSignedIn(<RoomGroups roomId="r1" />, {
    route: '/rooms/r1/groups',
    configure: (fake) => {
      fake.stubs.rooms.myPermissions.mockResolvedValue({ capabilities });
      fake.stubs.rooms.list.mockResolvedValue({
        items: [
          roomItem({ id: 'r1', name: 'General' }),
          roomItem({ id: 's1', name: 'Design space', type: 'space' }),
        ],
      });
      fake.stubs.rooms.members.mockResolvedValue({
        items: [roomMember('u1', 'Alice'), roomMember('u2', 'Bob'), roomMember('u3', 'Carol')],
        nextCursor: null,
      } as never);
      fake.stubs.groups.list.mockResolvedValue({
        items: [group('g1', 'design'), group('g2', 'ops', { nodeId: 's1', inherited: true })],
      } as never);
      fake.stubs.groups.get.mockImplementation((async (_room: string, groupId: string) => ({
        ...group(groupId, groupId === 'g1' ? 'design' : 'ops'),
        members: [user('u1', 'Alice')],
      })) as never);
      configure?.(fake);
    },
  });
}

describe('RoomGroups', () => {
  it('guards the page without room.manage_groups', async () => {
    const { fake } = renderGroups(undefined, ['room.read']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not allowed to manage the groups of this room.',
    );
    expect(fake.stubs.groups.list).not.toHaveBeenCalled();
  });

  it('lists the groups of the room, and the inherited ones read-only with their origin', async () => {
    renderGroups();

    const own = await screen.findByRole('region', { name: 'Groups of this room' });
    expect(within(own).getByText('@design')).toBeInTheDocument();
    expect(within(own).getByRole('button', { name: 'Rename design' })).toBeInTheDocument();
    expect(within(own).getByRole('button', { name: 'Delete design' })).toBeInTheDocument();

    const inherited = screen.getByRole('region', { name: 'Inherited groups' });
    expect(within(inherited).getByText('@ops')).toBeInTheDocument();
    expect(within(inherited).getByText(/defined on Design space/)).toBeInTheDocument();
    expect(within(inherited).queryByRole('button', { name: /Rename|Delete/ })).toBeNull();
  });

  it('shows an empty state without a group of its own', async () => {
    renderGroups(({ stubs }) => stubs.groups.list.mockResolvedValue({ items: [] } as never));

    expect(await screen.findByText('No group yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inherited groups' })).toBeNull();
  });

  it('shows an error state and retries the list', async () => {
    const { fake, user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.list.mockRejectedValueOnce(new Error('boom')),
    );

    expect(await screen.findByText('The groups could not be loaded.')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('@design')).toBeInTheDocument();
    expect(fake.stubs.groups.list).toHaveBeenCalledTimes(2);
  });

  it('creates a group and refreshes the list', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.type(screen.getByLabelText('New group'), 'reviewers');
    fake.stubs.groups.list.mockResolvedValue({
      items: [group('g1', 'design'), group('g3', 'reviewers')],
    } as never);
    await actor.click(screen.getByRole('button', { name: 'Create' }));

    expect(fake.stubs.groups.create).toHaveBeenCalledWith('r1', { name: 'reviewers' });
    expect(await screen.findByText('@reviewers')).toBeInTheDocument();
    expect(screen.getByLabelText('New group')).toHaveValue('');
  });

  it.each([
    ['Design', 'Use 1 to 32 characters'],
    ['has space', 'Use 1 to 32 characters'],
    ['moderator', 'This name is reserved'],
  ])('validates the name %s before calling the server', async (name, message) => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.type(screen.getByLabelText('New group'), name);
    await actor.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(fake.stubs.groups.create).not.toHaveBeenCalled();
  });

  it.each([
    ['group.name_taken', 'A group with this name already exists'],
    ['group.name_reserved', 'This name is reserved'],
    ['room.permission_denied', 'You are not allowed to do this in this room'],
  ])('maps the server error %s on create', async (code, message) => {
    const { user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.create.mockRejectedValue(new EkozError({ code, status: 409 }) as never),
    );
    await screen.findByText('@design');

    await actor.type(screen.getByLabelText('New group'), 'taken');
    await actor.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('renames a group', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Rename design' }));
    const input = screen.getByLabelText('New name');
    await actor.clear(input);
    await actor.type(input, 'ux');
    await actor.click(screen.getByRole('button', { name: 'Save' }));

    expect(fake.stubs.groups.rename).toHaveBeenCalledWith('r1', 'g1', 'ux');
    await waitFor(() => expect(screen.queryByLabelText('New name')).toBeNull());
  });

  it('keeps the rename form open and shows the server error', async () => {
    const { user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.rename.mockRejectedValue(
        new EkozError({ code: 'group.name_taken', status: 409 }) as never,
      ),
    );
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Rename design' }));
    const input = screen.getByLabelText('New name');
    await actor.clear(input);
    await actor.type(input, 'ops');
    await actor.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByLabelText('New name')).toBeInTheDocument();
  });

  it('cancels a rename', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Rename design' }));
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('New name')).toBeNull();
    expect(fake.stubs.groups.rename).not.toHaveBeenCalled();
  });

  it('asks for a confirmation before deleting a group', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Delete design' }));
    const dialog = await screen.findByRole('dialog');
    expect(fake.stubs.groups.remove).not.toHaveBeenCalled();
    await actor.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fake.stubs.groups.remove).not.toHaveBeenCalled();

    await actor.click(screen.getByRole('button', { name: 'Delete design' }));
    await actor.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(fake.stubs.groups.remove).toHaveBeenCalledWith('r1', 'g1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the error when a delete fails, for a group that is already gone', async () => {
    const { user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.remove.mockRejectedValue(
        new EkozError({ code: 'group.not_found', status: 404 }) as never,
      ),
    );
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Delete design' }));
    await actor.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(await screen.findByText('This group no longer exists.')).toBeInTheDocument();
  });

  it('lists the members of a group and adds one from the room members', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Show the members of design' }));
    expect(await screen.findByText('Alice')).toBeInTheDocument();

    await actor.click(screen.getByRole('combobox', { name: 'Add a member to design' }));
    const list = screen.getByRole('listbox');
    // Alice is already in the group.
    expect(within(list).queryByRole('option', { name: 'Alice' })).toBeNull();
    await actor.click(within(list).getByRole('option', { name: 'Bob' }));
    await actor.click(screen.getByRole('button', { name: 'Add' }));

    expect(fake.stubs.groups.addMember).toHaveBeenCalledWith('r1', 'g1', 'u2');
  });

  it('adds several members picked by filtering', async () => {
    const { fake, user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.get.mockResolvedValue({
        ...group('g1', 'design'),
        members: [user('u1', 'Alice')],
      } as never),
    );
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Show the members of design' }));
    await screen.findByText('Alice');
    const input = screen.getByRole('combobox', { name: 'Add a member to design' });
    await actor.type(input, 'bo');
    await actor.click(screen.getByRole('option', { name: 'Bob' }));
    await actor.type(input, 'car{Enter}');

    expect(screen.getByRole('button', { name: 'Remove Bob from the selection' })).toBeVisible();
    await actor.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(fake.stubs.groups.addMember).toHaveBeenCalledTimes(2));
    expect(fake.stubs.groups.addMember).toHaveBeenNthCalledWith(1, 'r1', 'g1', 'u2');
    expect(fake.stubs.groups.addMember).toHaveBeenNthCalledWith(2, 'r1', 'g1', 'u3');
  });

  it('removes a member', async () => {
    const { fake, user: actor } = renderGroups();
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Show the members of design' }));
    await actor.click(await screen.findByRole('button', { name: 'Remove Alice' }));

    expect(fake.stubs.groups.removeMember).toHaveBeenCalledWith('r1', 'g1', 'u1');
  });

  it('maps a member error', async () => {
    const { user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.addMember.mockRejectedValue(
        new EkozError({ code: 'group.member_not_member', status: 422 }) as never,
      ),
    );
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Show the members of design' }));
    await actor.click(await screen.findByRole('combobox'));
    await actor.click(screen.getByRole('option', { name: 'Bob' }));
    await actor.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('not a member of the room');
  });

  it('shows the members of an inherited group without editing controls', async () => {
    const { user: actor } = renderGroups();
    await screen.findByText('@ops');

    await actor.click(screen.getByRole('button', { name: 'Show the members of ops' }));

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Alice' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows an empty group', async () => {
    const { user: actor } = renderGroups(({ stubs }) =>
      stubs.groups.get.mockResolvedValue({ ...group('g1', 'design'), members: [] } as never),
    );
    await screen.findByText('@design');

    await actor.click(screen.getByRole('button', { name: 'Show the members of design' }));

    expect(await screen.findByText('No member in this group.')).toBeInTheDocument();
  });

  it('localises the page', async () => {
    renderGroups(undefined, ['room.manage_groups']);
    expect(await screen.findByRole('heading', { name: 'Groups' })).toBeInTheDocument();
  });
});
