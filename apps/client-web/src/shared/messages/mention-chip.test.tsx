import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MentionChip } from '@/shared/messages/mention-chip';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../test/render';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@/shared/ui/popover', () => import('../../../test/popover-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const member = (id: string, displayName: string | null) => ({
  role: 'moderator',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id, identifier: displayName ? `${id}/example.test` : null, displayName, avatarUrl: null },
});

interface Setup {
  members?: unknown[];
  summaries?: unknown[];
  groups?: unknown[];
  language?: string;
}

function setup(target: Parameters<typeof MentionChip>[0]['target'], options: Setup = {}) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.rooms.members.mockResolvedValue({
    items: options.members ?? [member('u1', 'Alice')],
    nextCursor: null,
  } as never);
  fake.stubs.users.summaries.mockResolvedValue((options.summaries ?? []) as never);
  fake.stubs.groups.list.mockResolvedValue({ items: options.groups ?? [] } as never);
  fake.stubs.users.getProfile.mockResolvedValue({
    identifier: 'u1/example.test',
    displayName: 'Alice',
    bio: 'Alice bio',
    avatarUrl: null,
  } as never);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <MentionChip roomId="r1" target={target} />
    </SdkProvider>,
    { language: options.language ?? 'en' },
  );
  return { fake, user: userEvent.setup() };
}

const userTarget = { type: 'user' as const, target: 'u1', token: '@u1/example.test' };

beforeEach(() => {
  createClientMock.mockReset();
});

it('shows a member as their display name and opens their profile card', async () => {
  const { user, fake } = setup(userTarget);

  const chip = await screen.findByRole('button', { name: 'Mention of Alice, open profile' });
  expect(chip).toHaveTextContent('@Alice');
  expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();

  await user.click(chip);
  expect(await screen.findByText('Alice bio')).toBeInTheDocument();
});

it('shows the raw token, muted and not clickable, while the members load', async () => {
  const { fake } = setup(userTarget);
  fake.stubs.rooms.members.mockReturnValue(new Promise(() => {}));

  expect(await screen.findByText('@u1/example.test')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('marks someone who left with a text note, resolved from the user summaries', async () => {
  const { fake } = setup(userTarget, {
    members: [],
    summaries: [{ id: 'u1', identifier: 'u1/example.test', displayName: 'Alice', avatarUrl: null }],
  });

  const chip = await screen.findByRole('img', { name: 'Mention of Alice, who left the room' });
  expect(chip).toHaveTextContent('@Alice (left)');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(fake.stubs.users.summaries).toHaveBeenCalledWith(['u1']);
});

it('shows the neutral label instead of the handle for a deleted account', async () => {
  setup(userTarget, {
    members: [],
    summaries: [{ id: 'u1', identifier: null, displayName: null, avatarUrl: null }],
  });

  const chip = await screen.findByRole('img', { name: 'Mention of a deleted account' });
  expect(chip).toHaveTextContent('@Deleted account');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('treats a member with no name left as a deleted account', async () => {
  setup(userTarget, { members: [member('u1', null)] });

  expect(
    await screen.findByRole('img', { name: 'Mention of a deleted account' }),
  ).toHaveTextContent('@Deleted account');
});

it('shows a localised label for a role', async () => {
  setup({ type: 'role', target: 'moderator', token: '@moderator' });

  expect(await screen.findByRole('img', { name: 'Mention of all moderators' })).toHaveTextContent(
    '@moderators',
  );
});

it('localises the labels in French', async () => {
  setup({ type: 'all', target: null, token: '@all' }, { language: 'fr' });

  expect(
    await screen.findByRole('img', { name: 'Mention de toutes les personnes du salon' }),
  ).toHaveTextContent('@tous');
});

it('shows @all as everyone', async () => {
  setup({ type: 'all', target: null, token: '@all' });

  const chip = await screen.findByRole('img', { name: 'Mention of everyone in the room' });
  expect(chip).toHaveTextContent('@everyone');
  expect(chip).toHaveAttribute('data-mention-kind', 'all');
});

it('shows the current name of a group, not the token it was written with', async () => {
  setup(
    { type: 'group', target: 'g1', token: '@old-name' },
    {
      groups: [
        {
          id: 'g1',
          nodeId: 'r1',
          name: 'new-name',
          memberCount: 2,
          inherited: false,
          isMember: true,
        },
      ],
    },
  );

  const chip = await screen.findByRole('img', { name: 'Mention of the group new-name' });
  expect(chip).toHaveTextContent('@new-name');
});

it('shows the raw token, muted, for a deleted group', async () => {
  setup({ type: 'group', target: 'gone', token: '@old-name' });

  const chip = await screen.findByRole('img', { name: 'Mention of a deleted group' });
  expect(chip).toHaveTextContent('@old-name');
  expect(chip.className).toContain('text-muted-foreground');
});

it('gives each kind its own colour', async () => {
  setup({ type: 'role', target: 'reader', token: '@reader' });
  const role = (await screen.findByRole('img')).className;
  expect(role).toContain('violet');
});
