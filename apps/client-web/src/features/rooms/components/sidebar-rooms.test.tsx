import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COLLAPSED_ROOMS_STORAGE_KEY } from '@/features/rooms/components/collapsed-rooms';
import { SidebarRooms } from '@/features/rooms/components/sidebar-rooms';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const items = [
  roomItem({ id: 'org', name: 'Org', type: 'space', access: 'context', role: null }),
  roomItem({ id: 'team', name: 'Team', type: 'space', parentId: 'org' }),
  roomItem({ id: 'general', name: 'General', parentId: 'team', access: 'inherited' }),
  roomItem({ id: 'random', name: 'Random' }),
];

const withRooms: Configure = ({ stubs }) => {
  stubs.rooms.list.mockResolvedValue({ items });
};

beforeEach(() => {
  createClientMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidebarRooms', () => {
  it('renders the tree: context nodes as headers, the others as links', async () => {
    renderSignedIn(<SidebarRooms />, { configure: withRooms });

    expect(await screen.findByRole('link', { name: 'Team' })).toHaveAttribute(
      'href',
      '/rooms/team',
    );
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/rooms/general');
    expect(screen.getByRole('link', { name: 'Random' })).toHaveAttribute('href', '/rooms/random');
    expect(screen.getByText('Org')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Org' })).not.toBeInTheDocument();
  });

  it('holds the New, Directory and Invitations entries', async () => {
    renderSignedIn(<SidebarRooms />, { configure: withRooms });

    expect(await screen.findByRole('link', { name: 'New' })).toHaveAttribute('href', '/rooms/new');
    expect(screen.getByRole('link', { name: 'Directory' })).toHaveAttribute(
      'href',
      '/rooms/directory',
    );
    expect(screen.getByRole('link', { name: /Invitations/ })).toHaveAttribute(
      'href',
      '/rooms/invitations',
    );
  });

  it('shows the pending invitations count as a badge', async () => {
    renderSignedIn(<SidebarRooms />, {
      configure: (fake) => {
        withRooms(fake);
        fake.stubs.roomInvitations.listMine.mockResolvedValue({ items: [{}, {}] });
      },
    });

    const badge = await screen.findByRole('status', { name: '2 pending invitations' });
    expect(badge).toHaveTextContent('2');
    expect(within(screen.getByRole('link', { name: /Invitations/ })).getByRole('status')).toBe(
      badge,
    );
  });

  it('shows no badge without a pending invitation', async () => {
    renderSignedIn(<SidebarRooms />, { configure: withRooms });

    await screen.findByRole('link', { name: 'Team' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('collapses a space and remembers it', async () => {
    const { user } = renderSignedIn(<SidebarRooms />, { configure: withRooms });

    await user.click(await screen.findByRole('button', { name: 'Collapse Team' }));

    expect(screen.queryByRole('link', { name: 'General' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Team' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(JSON.parse(localStorage.getItem(COLLAPSED_ROOMS_STORAGE_KEY) ?? '[]')).toEqual(['team']);
  });

  it('restores the collapsed spaces from storage', async () => {
    localStorage.setItem(COLLAPSED_ROOMS_STORAGE_KEY, JSON.stringify(['org']));

    renderSignedIn(<SidebarRooms />, { configure: withRooms });

    expect(await screen.findByRole('button', { name: 'Expand Org' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument();
  });

  it('keeps working when storage is unavailable', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { user } = renderSignedIn(<SidebarRooms />, { configure: withRooms });

    await user.click(await screen.findByRole('button', { name: 'Collapse Team' }));

    expect(screen.queryByRole('link', { name: 'General' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Team' }));
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument();
  });

  it('ignores a malformed stored value', async () => {
    localStorage.setItem(COLLAPSED_ROOMS_STORAGE_KEY, '{not json');

    renderSignedIn(<SidebarRooms />, { configure: withRooms });

    expect(await screen.findByRole('link', { name: 'General' })).toBeInTheDocument();
  });

  it('says when there is no room yet', async () => {
    renderSignedIn(<SidebarRooms />);

    expect(await screen.findByText('No rooms yet.')).toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    renderSignedIn(<SidebarRooms />, {
      configure: ({ stubs }) => stubs.rooms.list.mockRejectedValue(new Error('offline')),
    });

    expect(await screen.findByText('The rooms could not be loaded.')).toBeInTheDocument();
  });

  it('renders nothing and fetches nothing when anonymous', async () => {
    const fake = createFakeSdk();
    createClientMock.mockReturnValue(fake.sdk);

    const { container } = renderWithProviders(
      <SdkProvider>
        <SidebarRooms />
      </SdkProvider>,
    );

    await vi.waitFor(() => expect(fake.stubs.session.getState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(fake.stubs.rooms.list).not.toHaveBeenCalled();
    expect(fake.stubs.roomInvitations.listMine).not.toHaveBeenCalled();
  });
});
