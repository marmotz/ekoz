import { EkozError, ValidationError } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateRoomForm } from '@/features/rooms/components/create-room-form';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const SPACES = [
  roomItem({ id: 's1', type: 'space', name: 'Team' }),
  roomItem({ id: 's2', type: 'space', name: 'Readers', access: 'inherited' }),
  roomItem({ id: 'c1', parentId: 's1', name: 'general' }),
];

/** Spaces `s1` and `s2`, `space.create_child` in `s1` only. */
const withSpaces: Configure = ({ stubs }) => {
  stubs.rooms.list.mockResolvedValue({ items: SPACES });
  stubs.rooms.myPermissions.mockImplementation(async (...args: unknown[]) => ({
    capabilities: args[0] === 's1' ? ['space.create_child'] : ['room.read'],
  }));
};

const asOwner: Configure = ({ stubs }) =>
  stubs.me.get.mockResolvedValue({ ...defaultMe, isOwner: true });

function renderForm(...configure: Configure[]) {
  return renderSignedIn(<CreateRoomForm />, {
    route: '/rooms/new',
    configure: (fake) => {
      for (const step of configure) step(fake);
    },
  });
}

function parentOptions() {
  const select = screen.getByLabelText('Parent space') as HTMLSelectElement;
  return [...select.options].map((option) => option.textContent);
}

describe('CreateRoomForm', () => {
  it('explains why nothing can be created without an eligible space', async () => {
    const { fake } = renderForm(({ stubs }) => {
      stubs.rooms.list.mockResolvedValue({ items: SPACES });
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['room.read'] });
    });

    expect(await screen.findByText(/You cannot create a space or a channel/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(fake.stubs.rooms.myPermissions).toHaveBeenCalledWith('s1');
    expect(fake.stubs.rooms.myPermissions).toHaveBeenCalledWith('s2');
    expect(fake.stubs.rooms.myPermissions).not.toHaveBeenCalledWith('c1');
  });

  it('offers only the spaces where the caller may create', async () => {
    renderForm(withSpaces);

    await screen.findByRole('button', { name: 'Create' });
    expect(parentOptions()).toEqual(['Choose a space', 'Team']);
    expect(screen.getByLabelText('Parent space')).toHaveValue('s1');
  });

  it('offers an owner a root space', async () => {
    renderForm(withSpaces, asOwner);

    await screen.findByRole('button', { name: 'Create' });
    expect(parentOptions()).toEqual(['No parent (root space)', 'Team']);
    expect(screen.getByLabelText('Parent space')).toHaveValue('');
  });

  it('lets an owner without any space create a root space only', async () => {
    const { fake, user } = renderForm(asOwner);

    await user.type(await screen.findByLabelText('Name'), 'Company');
    expect(screen.getByRole('radio', { name: 'Channel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(fake.stubs.rooms.createSpace).toHaveBeenCalledWith({
        name: 'Company',
        topic: undefined,
        visibility: 'private',
        parentId: undefined,
      }),
    );
  });

  it('never offers a channel the root option: a channel needs a parent', async () => {
    const { fake, user } = renderForm(withSpaces, asOwner);

    await user.click(await screen.findByRole('radio', { name: 'Channel' }));

    expect(parentOptions()).toEqual(['Choose a space', 'Team']);
    expect(screen.getByLabelText('Parent space')).toHaveValue('s1');

    await user.type(screen.getByLabelText('Name'), 'random');
    await user.type(screen.getByLabelText('Topic'), 'Off topic');
    await user.selectOptions(screen.getByLabelText('Visibility'), 'public');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(fake.stubs.rooms.createChannel).toHaveBeenCalledWith({
        parentId: 's1',
        name: 'random',
        topic: 'Off topic',
        visibility: 'public',
      }),
    );
  });

  it('keeps what was typed when a new space shows up in the refreshed list', async () => {
    // The cached list may not hold a space created a moment ago; its refetch must not reset the form.
    const { fake, user, queryClient } = renderForm(asOwner, ({ stubs }) =>
      stubs.rooms.myPermissions.mockResolvedValue({ capabilities: ['space.create_child'] }),
    );
    await user.type(await screen.findByLabelText('Name'), 'random');
    expect(screen.getByRole('radio', { name: 'Channel' })).toBeDisabled();

    fake.stubs.rooms.list.mockResolvedValue({ items: SPACES });
    await queryClient.invalidateQueries({ queryKey: ['rooms', 'list'] });

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Channel' })).toBeEnabled());
    expect(screen.getByLabelText('Name')).toHaveValue('random');
    await user.click(screen.getByRole('radio', { name: 'Channel' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(fake.stubs.rooms.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 's1', name: 'random' }),
      ),
    );
    expect(fake.stubs.rooms.createSpace).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    const { fake, user } = renderForm(withSpaces);

    await user.click(await screen.findByRole('button', { name: 'Create' }));

    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(fake.stubs.rooms.createSpace).not.toHaveBeenCalled();
  });

  it('disables Create while the request is in flight, then enables it again', async () => {
    let fail: (error: unknown) => void = () => {};
    const { user } = renderForm(withSpaces, ({ stubs }) =>
      stubs.rooms.createSpace.mockReturnValue(
        new Promise((_resolve, reject) => {
          fail = reject;
        }) as never,
      ),
    );

    await user.type(await screen.findByLabelText('Name'), 'Design');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled());
    fail(new EkozError({ code: 'room.permission_denied', status: 403 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
  });

  it('opens the new room', async () => {
    const { fake, user, router } = renderForm(withSpaces, ({ stubs }) =>
      stubs.rooms.createSpace.mockResolvedValue({ id: 'new-space' } as never),
    );

    await user.type(await screen.findByLabelText('Name'), 'Design');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms/new-space'));
    expect(fake.stubs.rooms.createSpace).toHaveBeenCalledWith({
      name: 'Design',
      topic: undefined,
      visibility: 'private',
      parentId: 's1',
    });
    expect(fake.stubs.rooms.list).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['room.max_depth_exceeded', 'Spaces cannot be nested any deeper.'],
    ['room.parent_not_found', 'The parent space no longer exists.'],
    ['room.invalid_parent_type', 'A room can only be placed inside a space.'],
  ])('shows %s under the parent field', async (code, message) => {
    const { user } = renderForm(withSpaces, ({ stubs }) =>
      stubs.rooms.createSpace.mockRejectedValue(new EkozError({ code, status: 422 })),
    );

    await user.type(await screen.findByLabelText('Name'), 'Deep');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const error = await screen.findByText(message);
    expect(error.previousElementSibling).toBe(screen.getByLabelText('Parent space'));
  });

  it('shows a permission error for the whole form', async () => {
    const { user, router } = renderForm(withSpaces, ({ stubs }) =>
      stubs.rooms.createSpace.mockRejectedValue(
        new EkozError({ code: 'room.permission_denied', status: 403 }),
      ),
    );

    await user.type(await screen.findByLabelText('Name'), 'Design');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not allowed to do this in this room.',
    );
    expect(router.state.location.pathname).toBe('/rooms/new');
  });

  it('attaches the field issues of a 422 to their fields', async () => {
    const { user } = renderForm(withSpaces, ({ stubs }) =>
      stubs.rooms.createSpace.mockRejectedValue(
        new ValidationError({
          code: 'validation_failed',
          status: 422,
          issues: [
            { path: 'name', message: 'Name rejected by the server' },
            { path: 'slug', message: 'Slug taken' },
          ],
        }),
      ),
    );

    await user.type(await screen.findByLabelText('Name'), 'Design');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name rejected by the server')).toHaveAttribute(
      'id',
      'field-name-error',
    );
    expect(screen.getByText('Slug taken')).toBeInTheDocument();
  });

  it('renders in French', async () => {
    const { i18n } = renderForm(withSpaces);
    await i18n.changeLanguage('fr');

    expect(
      await screen.findByRole('heading', { name: 'Créer un espace ou un salon' }),
    ).toBeInTheDocument();
  });
});
