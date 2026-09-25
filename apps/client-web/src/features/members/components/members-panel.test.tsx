import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MembersPanel } from '@/features/members/components/members-panel';
import {
  MEMBERS_PANEL_STORAGE_KEY,
  reloadMembersPanelPrefs,
} from '@/features/members/hooks/use-members-panel-prefs';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const member = (id: string, displayName: string | null, role = 'member') => ({
  role,
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id,
    identifier: displayName ? `${displayName.toLowerCase()}/h.io` : null,
    displayName,
    avatarUrl: null,
  },
});

const MEMBERS = [
  member('u1', 'Alice', 'space_admin'),
  member('u2', 'Bob', 'member'),
  member('u3', 'Carol', 'moderator'),
  member('u4', null, 'member'),
  member('u5', 'Dave', 'reader'),
];

function viewport(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: desktop && query.includes('min-width: 1024px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function setup({
  desktop = true,
  open = true,
  view,
  configure,
}: {
  desktop?: boolean;
  open?: boolean;
  view?: 'role' | 'alpha';
  configure?: Configure;
} = {}) {
  viewport(desktop);
  window.localStorage.setItem(
    MEMBERS_PANEL_STORAGE_KEY,
    JSON.stringify({ open, view: view ?? 'role' }),
  );
  reloadMembersPanelPrefs();

  return renderSignedIn(<MembersPanel roomId="r1" />, {
    configure: (fake) => {
      fake.stubs.rooms.members.mockResolvedValue({ items: MEMBERS, nextCursor: null } as never);
      configure?.(fake);
    },
  });
}

beforeEach(() => {
  createClientMock.mockReset();
  window.localStorage.clear();
});

describe('MembersPanel, inline from lg', () => {
  it('lists the members grouped by role, without deleted accounts', async () => {
    setup();

    const panel = await screen.findByRole('complementary', { name: 'Members' });
    expect(await within(panel).findByText('Alice')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    // Four members are left once the deleted account is dropped.
    expect(within(panel).getByText('4')).toBeInTheDocument();
    const headings = within(panel)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Space admins · 1', 'Moderators · 1', 'Members · 1', 'Readers · 1']);
    expect(within(panel).queryByText('Room admins · 0')).not.toBeInTheDocument();
  });

  it('switches to the alphabetical view and remembers it', async () => {
    const { user } = setup();
    const panel = await screen.findByRole('complementary', { name: 'Members' });
    await within(panel).findByText('Alice');

    await user.click(within(panel).getByRole('button', { name: 'A to Z' }));

    expect(within(panel).queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Alice'),
      expect.stringContaining('Bob'),
      expect.stringContaining('Carol'),
      expect.stringContaining('Dave'),
    ]);
    expect(within(panel).getByRole('button', { name: 'A to Z' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? '')).toMatchObject({
      view: 'alpha',
    });
  });

  it('filters by the search, keeping the total, and says when nothing matches', async () => {
    const { user } = setup();
    const panel = await screen.findByRole('complementary', { name: 'Members' });
    await within(panel).findByText('Alice');

    await user.type(within(panel).getByRole('searchbox', { name: 'Search members' }), 'CAR');

    expect(within(panel).getByText('Carol')).toBeInTheDocument();
    expect(within(panel).queryByText('Alice')).not.toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();

    await user.type(within(panel).getByRole('searchbox'), 'zzz');

    expect(within(panel).getByText('No member matches your search.')).toBeInTheDocument();
  });

  it('opens the profile card of a member with their role', async () => {
    const { user, fake } = setup();
    fake.stubs.users.getProfile.mockResolvedValue({
      identifier: 'carol/h.io',
      displayName: 'Carol',
      bio: 'Carol bio',
      avatarUrl: null,
    } as never);
    const panel = await screen.findByRole('complementary', { name: 'Members' });

    await user.click(await within(panel).findByRole('button', { name: /Carol/ }));

    const card = await screen.findByRole('dialog');
    expect(await within(card).findByText('Carol bio')).toBeInTheDocument();
    expect(within(card).getByText('Role: Moderator')).toBeInTheDocument();
    expect(fake.stubs.users.getProfile).toHaveBeenCalledWith('carol/h.io');
  });

  it('closes from its own button', async () => {
    const { user } = setup();
    const panel = await screen.findByRole('complementary', { name: 'Members' });

    await user.click(within(panel).getByRole('button', { name: 'Close the members panel' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? '')).toMatchObject({
      open: false,
    });
  });

  it('renders nothing while closed', async () => {
    const { fake } = setup({ open: false });

    await waitFor(() => expect(fake.stubs.session.resume).toHaveBeenCalled());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(fake.stubs.rooms.members).not.toHaveBeenCalled();
  });

  it('shows a skeleton while loading', async () => {
    setup({
      configure: (fake) => {
        fake.stubs.rooms.members.mockReturnValue(new Promise(() => {}));
      },
    });

    expect(await screen.findByRole('status', { name: 'Loading the members' })).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    const { user, fake } = setup({
      configure: (f) => {
        f.stubs.rooms.members.mockRejectedValueOnce(new Error('offline'));
      },
    });

    expect(await screen.findByText('The members could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when the list is truncated', async () => {
    setup({
      configure: (fake) => {
        fake.stubs.rooms.members.mockResolvedValue({
          items: MEMBERS,
          nextCursor: 'more',
        } as never);
      },
    });

    // Every page answers the same list, so the ten pages repeat it.
    expect((await screen.findAllByText('Alice')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Only the first \d+ members are listed/)).toBeInTheDocument();
  });

  it('says when the room has no member', async () => {
    setup({
      configure: (fake) => {
        fake.stubs.rooms.members.mockResolvedValue({
          items: [member('u4', null)],
          nextCursor: null,
        } as never);
      },
    });

    expect(await screen.findByText('No members.')).toBeInTheDocument();
  });

  it('shows French labels', async () => {
    viewport(true);
    window.localStorage.setItem(
      MEMBERS_PANEL_STORAGE_KEY,
      JSON.stringify({ open: true, view: 'role' }),
    );
    reloadMembersPanelPrefs();
    const { renderWithProviders } = await import('../../../../test/render');
    const { SdkProvider } = await import('@/shared/sdk/provider');
    const { createFakeSdk } = await import('../../../../test/sdk-mock');
    const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
    fake.stubs.rooms.members.mockResolvedValue({ items: MEMBERS, nextCursor: null } as never);
    createClientMock.mockReturnValue(fake.sdk);

    renderWithProviders(
      <SdkProvider>
        <MembersPanel roomId="r1" />
      </SdkProvider>,
      { language: 'fr' },
    );

    expect(await screen.findByText("Administrateurs de l'espace · 1")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Par rôle' })).toBeInTheDocument();
  });
});

describe('MembersPanel, below lg', () => {
  it('shows the list in a sheet from the right', async () => {
    setup({ desktop: false });

    const sheet = await screen.findByRole('dialog', { name: 'Members' });
    expect(await within(sheet).findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('stays hidden while closed', async () => {
    const { fake } = setup({ desktop: false, open: false });

    await waitFor(() => expect(fake.stubs.session.resume).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet through its own control and remembers it', async () => {
    const { user } = setup({ desktop: false });
    const sheet = await screen.findByRole('dialog', { name: 'Members' });

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem(MEMBERS_PANEL_STORAGE_KEY) ?? '')).toMatchObject({
      open: false,
    });
  });
});
