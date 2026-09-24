import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomsWelcomePage } from '@/features/rooms/routes/rooms-welcome-page';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

describe('RoomsWelcomePage', () => {
  it('shows the empty state pointing to the directory', async () => {
    renderSignedIn(<RoomsWelcomePage />);

    expect(await screen.findByText(/not in any room yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the directory' })).toHaveAttribute(
      'href',
      '/rooms/directory',
    );
    expect(screen.queryByRole('link', { name: 'Create a space' })).not.toBeInTheDocument();
  });

  it('points an owner to creation too', async () => {
    renderSignedIn(<RoomsWelcomePage />, {
      configure: ({ stubs }) => stubs.me.get.mockResolvedValue({ ...defaultMe, isOwner: true }),
    });

    expect(await screen.findByRole('link', { name: 'Create a space' })).toHaveAttribute(
      'href',
      '/rooms/new',
    );
  });

  it('hints to pick a room when the user has some', async () => {
    renderSignedIn(<RoomsWelcomePage />, {
      configure: ({ stubs }) =>
        stubs.rooms.list.mockResolvedValue({ items: [roomItem({ id: 'r1' })] }),
    });

    expect(await screen.findByText(/Pick a room in the sidebar/)).toBeInTheDocument();
    expect(screen.queryByText(/not in any room yet/)).not.toBeInTheDocument();
  });

  it('points to the pending invitations instead of the empty state', async () => {
    renderSignedIn(<RoomsWelcomePage />, {
      configure: ({ stubs }) => stubs.roomInvitations.listMine.mockResolvedValue({ items: [{}] }),
    });

    expect(await screen.findByText('You have 1 pending invitation.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the invitations' })).toHaveAttribute(
      'href',
      '/rooms/invitations',
    );
    expect(screen.queryByText(/not in any room yet/)).not.toBeInTheDocument();
  });

  it('renders in French', async () => {
    const { i18n } = renderSignedIn(<RoomsWelcomePage />);
    await i18n.changeLanguage('fr');

    expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument();
  });
});
