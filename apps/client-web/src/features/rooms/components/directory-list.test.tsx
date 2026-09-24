import { EkozError } from '@ekozhq/sdk';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectoryList } from '@/features/rooms/components/directory-list';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function channel(id: string, topic: string | null = null) {
  return roomItem({ id, name: `#${id}`, topic, visibility: 'public' });
}

const page = (items: unknown[], nextCursor: string | null = null) =>
  ({ items, nextCursor }) as never;

function renderDirectory(configure?: Configure) {
  return renderSignedIn(<DirectoryList />, { route: '/rooms/directory', configure });
}

function row(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement;
}

describe('DirectoryList', () => {
  it('lists every public channel without a query', async () => {
    const { fake } = renderDirectory(({ stubs }) =>
      stubs.directory.list.mockResolvedValue(page([channel('lobby', 'Say hi')])),
    );

    expect(await screen.findByText('#lobby')).toBeInTheDocument();
    expect(screen.getByText('Say hi')).toBeInTheDocument();
    expect(fake.stubs.directory.list).toHaveBeenCalledWith({ query: undefined, cursor: undefined });
  });

  it('debounces the search', async () => {
    const { fake, user } = renderDirectory();
    await screen.findByText('No public channel yet.');

    await user.type(screen.getByRole('searchbox', { name: 'Search public channels' }), 'gen');

    expect(fake.stubs.directory.list).not.toHaveBeenCalledWith({ query: 'gen', cursor: undefined });
    await waitFor(() =>
      expect(fake.stubs.directory.list).toHaveBeenCalledWith({ query: 'gen', cursor: undefined }),
    );
    expect(fake.stubs.directory.list).not.toHaveBeenCalledWith({ query: 'g', cursor: undefined });
    expect(fake.stubs.directory.list).not.toHaveBeenCalledWith({ query: 'ge', cursor: undefined });
    expect(await screen.findByText('No public channel matches this search.')).toBeInTheDocument();
  });

  it('loads the next page on demand', async () => {
    const { fake, user } = renderDirectory(({ stubs }) =>
      stubs.directory.list
        .mockResolvedValueOnce(page([channel('a')], 'c2'))
        .mockResolvedValueOnce(page([channel('b')])),
    );

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('#b')).toBeInTheDocument();
    expect(screen.getByText('#a')).toBeInTheDocument();
    expect(fake.stubs.directory.list).toHaveBeenLastCalledWith({ query: undefined, cursor: 'c2' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('opens the rooms the caller already reads and offers to join the others', async () => {
    renderDirectory(({ stubs }) => {
      stubs.rooms.list.mockResolvedValue({
        items: [roomItem({ id: 'mine' }), roomItem({ id: 'inherited', access: 'inherited' })],
      });
      stubs.directory.list.mockResolvedValue(
        page([channel('mine'), channel('inherited'), channel('other')]),
      );
    });

    await screen.findByText('#other');
    await waitFor(() =>
      expect(within(row('#mine')).getByRole('link', { name: 'Open' })).toHaveAttribute(
        'href',
        '/rooms/mine',
      ),
    );
    expect(within(row('#inherited')).getByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(within(row('#other')).getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  it('joins a room, then opens it', async () => {
    const { fake, user, router } = renderDirectory(({ stubs }) =>
      stubs.directory.list.mockResolvedValue(page([channel('other')])),
    );

    await user.click(await screen.findByRole('button', { name: 'Join' }));

    expect(fake.stubs.rooms.join).toHaveBeenCalledWith('other');
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms/other'));
  });

  it('opens the room when the caller already is a member', async () => {
    const { user, router } = renderDirectory(({ stubs }) => {
      stubs.directory.list.mockResolvedValue(page([channel('other')]));
      stubs.rooms.join.mockRejectedValue(
        new EkozError({ code: 'room.already_member', status: 409 }),
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Join' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms/other'));
  });

  it.each([
    ['room.banned', 403, 'You are banned from this room.'],
    ['room.not_joinable', 422, 'This room cannot be joined directly.'],
  ])('shows %s on the row', async (code, status, message) => {
    const { user, router } = renderDirectory(({ stubs }) => {
      stubs.directory.list.mockResolvedValue(page([channel('other'), channel('else')]));
      stubs.rooms.join.mockRejectedValue(new EkozError({ code, status }));
    });

    await screen.findByText('#other');
    await user.click(within(row('#other')).getByRole('button', { name: 'Join' }));

    expect(await within(row('#other')).findByRole('alert')).toHaveTextContent(message);
    expect(within(row('#else')).queryByRole('alert')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rooms/directory');
  });

  it('offers a retry when the directory cannot be loaded', async () => {
    const { fake, user } = renderDirectory(({ stubs }) =>
      stubs.directory.list.mockRejectedValueOnce(new Error('boom')),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No public channel yet.')).toBeInTheDocument();
    expect(fake.stubs.directory.list).toHaveBeenCalledTimes(2);
  });
});
