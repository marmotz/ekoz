import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MessageItem } from '@/features/chat/components/message-item';
import type { Author } from '@/features/chat/hooks/use-authors';
import type { TimelineMessage } from '@/features/chat/lib/timeline';
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
  editedAt: null,
  redactedAt: null,
  hiddenAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
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

function setup(author: Author) {
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
        <MessageItem message={message} author={author} />
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

it('marks someone who left with a door and shows the left note in their card', async () => {
  const { user } = setup(left);

  expect(await screen.findByRole('img', { name: 'Left the room' })).toHaveTextContent('🚪');
  await user.click(screen.getByRole('button', { name: 'Alice' }));

  expect(await screen.findByText('Alice bio')).toBeInTheDocument();
  expect(screen.getByText('Left the room')).toBeInTheDocument();
  expect(screen.queryByText(/^Role:/)).not.toBeInTheDocument();
});

it('shows a deleted account as plain text with a skull marker', async () => {
  const { fake } = setup(deleted);

  expect(await screen.findByText('Deleted account')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Deleted account' })).toHaveTextContent('💀');
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
