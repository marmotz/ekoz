import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyMentionsList } from '@/features/mentions/components/my-mentions-list';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

function mention(seq: number, overrides: Record<string, unknown> = {}) {
  const { message, room, ...rest } = overrides as {
    message?: Record<string, unknown>;
    room?: Record<string, unknown>;
  };
  return {
    message: {
      id: `m${seq}`,
      roomId: 'r1',
      seq: String(seq),
      authorId: 'u1',
      body: `mention body ${seq}`,
      replyToId: null,
      mentions: [],
      mentionsMe: 'direct',
      editedAt: null,
      redactedAt: null,
      hiddenAt: null,
      createdAt: '2026-03-14T10:00:00.000Z',
      ...message,
    },
    room: { id: 'r1', type: 'channel', name: 'General', parentId: null, ...room },
    mentionsMe: 'direct',
    unread: true,
    ...rest,
  };
}

const withPages =
  (...pages: { items: unknown[]; nextCursor: string | null }[]): Configure =>
  ({ stubs }) => {
    stubs.users.summaries.mockResolvedValue([
      { id: 'u1', identifier: 'alice/example.test', displayName: 'Alice', avatarUrl: null },
    ] as never);
    for (const page of pages) stubs.mentions.list.mockResolvedValueOnce(page as never);
  };

function renderList(configure?: Configure) {
  return renderSignedIn(<MyMentionsList />, { route: '/mentions', configure });
}

describe('MyMentionsList', () => {
  it('shows an empty state', async () => {
    renderList(withPages({ items: [], nextCursor: null }));

    expect(await screen.findByText('Nobody has mentioned you yet.')).toBeInTheDocument();
  });

  it('shows an error state and retries', async () => {
    const { fake, user } = renderList(({ stubs }) => {
      stubs.mentions.list.mockRejectedValueOnce(new Error('boom'));
      stubs.mentions.list.mockResolvedValueOnce({ items: [mention(1)], nextCursor: null } as never);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your mentions could not be loaded.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('mention body 1')).toBeInTheDocument();
    expect(fake.stubs.mentions.list).toHaveBeenCalledTimes(2);
  });

  it('shows the room, author, time, body and markers of each mention', async () => {
    renderList(
      withPages({
        items: [
          mention(2, { mentionsMe: 'collective', unread: false, room: { name: 'Design' } }),
          mention(1),
        ],
        nextCursor: null,
      }),
    );

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);

    const first = items[0] as HTMLElement;
    expect(within(first).getByText('Design')).toBeInTheDocument();
    expect(within(first).getByText('mention body 2')).toBeInTheDocument();
    expect(within(first).getByText('Mentions a group')).toBeInTheDocument();
    expect(within(first).queryByText('Unread')).toBeNull();
    expect(first).not.toHaveAttribute('data-unread');
    expect(first).toHaveAttribute('data-mentions-me', 'collective');

    const second = items[1] as HTMLElement;
    expect(within(second).getByText('General')).toBeInTheDocument();
    expect(await within(second).findByText('Alice')).toBeInTheDocument();
    expect(within(second).getByText('Mentions you')).toBeInTheDocument();
    expect(within(second).getByText('Unread')).toBeInTheDocument();
    expect(second).toHaveAttribute('data-unread');
    expect(within(second).getByText(/2026/)).toBeInTheDocument();
  });

  it('renders the chips of the message body', async () => {
    renderList(
      withPages({
        items: [
          mention(1, {
            message: {
              body: 'hey @all',
              mentions: [{ type: 'all', target: null, token: '@all' }],
            },
          }),
        ],
        nextCursor: null,
      }),
    );

    expect(
      await screen.findByRole('img', { name: 'Mention of everyone in the room' }),
    ).toBeInTheDocument();
  });

  it('names a deleted author', async () => {
    renderList(
      withPages({ items: [mention(1, { message: { authorId: null } })], nextCursor: null }),
    );

    expect(await screen.findByText('Deleted account')).toBeInTheDocument();
  });

  it('opens the room at the mentioned message', async () => {
    const { router } = renderList(
      withPages({ items: [mention(42, { room: { id: 'r7', name: 'Ops' } })], nextCursor: null }),
    );

    const link = await screen.findByRole('link', { name: 'Open Ops at this message' });

    expect(link).toHaveAttribute('href', expect.stringContaining('/rooms/r7'));
    expect(link.getAttribute('href')).toContain('at=');
    expect(link.getAttribute('href')).toContain('42');
    expect(router).toBeDefined();
  });

  it('loads the next page from the cursor', async () => {
    const { fake, user } = renderList(
      withPages(
        { items: [mention(2)], nextCursor: 'c1' },
        { items: [mention(1)], nextCursor: null },
      ),
    );
    await screen.findByText('mention body 2');
    expect(fake.stubs.mentions.list).toHaveBeenCalledWith({ limit: 30 });

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('mention body 1')).toBeInTheDocument();
    expect(fake.stubs.mentions.list).toHaveBeenLastCalledWith({ limit: 30, cursor: 'c1' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
