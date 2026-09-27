import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MessageItem } from '@/features/chat/components/message-item';
import type { Author } from '@/features/chat/hooks/use-authors';
import type { TimelineMessage } from '@/features/chat/lib/timeline';
import { resetPresence, setPresence } from '@/shared/realtime/presence-store';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const message: TimelineMessage = {
  id: 'm1',
  roomId: 'r1',
  seq: '1',
  authorId: 'u1',
  body: 'hello there',
  replyToId: null,
  mentions: [],
  mentionsMe: null,
  editedAt: null,
  redactedAt: null,
  hiddenAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  reactions: [],
  attachments: [],
  linkPreview: null,
};

const member: Author = {
  kind: 'member',
  userId: 'u1',
  identifier: 'alice/example.test',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'moderator',
};

const left: Author = { ...member, kind: 'left', role: null };
const deleted: Author = {
  kind: 'deleted',
  userId: 'u1',
  identifier: null,
  displayName: null,
  avatarUrl: null,
  role: null,
};
const pending: Author = { ...deleted, kind: 'pending' };

function setup(author: Author, item: TimelineMessage = message) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.users.getProfile.mockResolvedValue({
    identifier: 'alice/example.test',
    displayName: 'Alice',
    bio: 'Alice bio',
    avatarUrl: null,
  } as never);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <ol>
        <MessageItem message={item} author={author} />
      </ol>
    </SdkProvider>,
  );

  return { fake, user: userEvent.setup() };
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('opens the profile card, with the role, from the author name', async () => {
  const { user } = setup(member);

  await user.click(await screen.findByRole('button', { name: 'Alice' }));

  expect(await screen.findByText('Alice bio')).toBeInTheDocument();
  expect(screen.getByText('Role: Moderator')).toBeInTheDocument();
  expect(screen.getByText('alice/example.test')).toBeInTheDocument();
});

it('opens the same card from the avatar, which stays out of the tab order', async () => {
  const { user } = setup(member);
  await screen.findByText('hello there');

  const avatarButton = document.querySelector('button[aria-hidden="true"]') as HTMLElement;
  expect(avatarButton).toHaveAttribute('tabindex', '-1');
  await user.click(avatarButton);

  expect(await screen.findByText('Alice bio')).toBeInTheDocument();
});

it('marks someone who left with a text note and shows the left note in their card', async () => {
  const { user } = setup(left);

  expect(await screen.findByText('(Left the room)')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Alice' }));

  expect(await screen.findByText('Alice bio')).toBeInTheDocument();
  expect(screen.getByText('Left the room')).toBeInTheDocument();
  expect(screen.queryByText(/^Role:/)).not.toBeInTheDocument();
});

it('shows a deleted account as plain text without any emoji marker', async () => {
  const { fake } = setup(deleted);

  expect(await screen.findByText('Deleted account')).toBeInTheDocument();
  expect(screen.queryByText('💀')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Deleted account' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();
});

it('shows a name placeholder, and no card, while the author is pending', async () => {
  setup(pending);

  expect(await screen.findByTestId('author-pending')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('does not fetch the profile before the card is opened', async () => {
  const { fake } = setup(member);
  await screen.findByRole('button', { name: 'Alice' });

  expect(fake.stubs.users.getProfile).not.toHaveBeenCalled();
});

it('does not highlight a message that does not concern the viewer', async () => {
  setup(member);

  const item = (await screen.findByText('hello there')).closest('li');
  expect(item).not.toHaveAttribute('data-mentions-me');
  expect(item?.className).not.toContain('bg-primary');
});

it('highlights a direct mention strongly and a collective one lightly', async () => {
  setup(member, { ...message, mentionsMe: 'direct' });
  const direct = (await screen.findByText('hello there')).closest('li');
  expect(direct).toHaveAttribute('data-mentions-me', 'direct');
  expect(direct?.className).toContain('bg-primary/15');
});

it('uses the lighter tint for a collective mention', async () => {
  setup(member, { ...message, mentionsMe: 'collective' });
  const collective = (await screen.findByText('hello there')).closest('li');
  expect(collective).toHaveAttribute('data-mentions-me', 'collective');
  expect(collective?.className).toContain('bg-primary/5');
  expect(collective?.className).not.toContain('bg-primary/15');
});

it('does not highlight a deleted message', async () => {
  setup(member, { ...message, mentionsMe: 'direct', redactedAt: '2026-01-01T11:00:00.000Z' });

  const item = (await screen.findByText('Message deleted')).closest('li');
  expect(item).not.toHaveAttribute('data-mentions-me');
});

it('renders the mention chips of the message', async () => {
  setup(member, {
    ...message,
    body: 'hi @all',
    mentions: [{ type: 'all', target: null, token: '@all' }],
  });

  expect(
    await screen.findByRole('img', { name: 'Mention of everyone in the room' }),
  ).toBeInTheDocument();
});

it('shows the presence dot of a member author, following the store', async () => {
  resetPresence();
  setPresence('u1', 'online');
  setup(member);

  // The avatar sits in a decorative (hidden) author card.
  expect(await screen.findByRole('img', { name: 'Online', hidden: true })).toBeInTheDocument();
});

it('shows no presence dot for an author who left or whose account is deleted', async () => {
  resetPresence();
  setPresence('u1', 'online');
  setup(left);

  await screen.findByText('hello there');
  expect(screen.queryByRole('img', { name: 'Online', hidden: true })).not.toBeInTheDocument();
});

it('renders the message attachments', async () => {
  setup(member, {
    ...message,
    body: '',
    attachments: [
      {
        id: 'a1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: '10240',
        width: null,
        height: null,
        durationMs: null,
        hasThumbnail: false,
      },
    ],
  });

  expect(await screen.findByText('report.pdf')).toBeInTheDocument();
});

it('does not render attachments of a deleted message', async () => {
  setup(member, {
    ...message,
    redactedAt: '2026-01-01T11:00:00.000Z',
    attachments: [
      {
        id: 'a1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: '10240',
        width: null,
        height: null,
        durationMs: null,
        hasThumbnail: false,
      },
    ],
  });

  await screen.findByText('Message deleted');
  expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
});

it('renders the message link preview', async () => {
  setup(member, {
    ...message,
    linkPreview: {
      id: 'p1',
      url: 'https://example.test',
      title: 'Example site',
      description: 'A description',
      siteName: 'example.test',
      hasImage: false,
    },
  });

  expect(await screen.findByText('Example site')).toBeInTheDocument();
});

it('does not render the link preview of a deleted message', async () => {
  setup(member, {
    ...message,
    redactedAt: '2026-01-01T11:00:00.000Z',
    linkPreview: {
      id: 'p1',
      url: 'https://example.test',
      title: 'Example site',
      description: 'A description',
      siteName: 'example.test',
      hasImage: false,
    },
  });

  await screen.findByText('Message deleted');
  expect(screen.queryByText('Example site')).not.toBeInTheDocument();
});
