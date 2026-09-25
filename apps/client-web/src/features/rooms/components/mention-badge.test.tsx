import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MentionBadge } from '@/features/rooms/components/mention-badge';
import { RoomTree } from '@/features/rooms/components/room-tree';
import { type Configure, renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const withUnread =
  (...items: unknown[]): Configure =>
  ({ stubs }) =>
    stubs.mentions.unread.mockResolvedValue({ items } as never);

describe('MentionBadge', () => {
  it('is filled and counts every unread mention when the caller was named', async () => {
    renderSignedIn(<MentionBadge roomId="r1" />, {
      configure: withUnread({ roomId: 'r1', direct: 2, collective: 3 }),
    });

    const badge = await screen.findByRole('status', {
      name: '5 unread mentions, including you by name',
    });
    expect(badge).toHaveTextContent('5');
    expect(badge).toHaveAttribute('data-mention-badge', 'direct');
    expect(badge.className).toContain('bg-primary');
  });

  it('is outlined when the room only has collective mentions', async () => {
    renderSignedIn(<MentionBadge roomId="r1" />, {
      configure: withUnread({ roomId: 'r1', direct: 0, collective: 1 }),
    });

    const badge = await screen.findByRole('status', { name: '1 unread group mention' });
    expect(badge).toHaveAttribute('data-mention-badge', 'collective');
    expect(badge.className).toContain('border');
    expect(badge.className).not.toContain('bg-primary');
  });

  it('caps the count', async () => {
    renderSignedIn(<MentionBadge roomId="r1" />, {
      configure: withUnread({ roomId: 'r1', direct: 150, collective: 0 }),
    });

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('shows nothing without unread mentions in the room', async () => {
    const { fake } = renderSignedIn(<MentionBadge roomId="r1" />, {
      configure: withUnread({ roomId: 'r2', direct: 3, collective: 0 }),
    });

    await vi.waitFor(() => expect(fake.stubs.mentions.unread).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('RoomTree', () => {
  it('shows the badge of each room next to its name, but not on a context header', async () => {
    const nodes = [
      {
        room: roomItem({ id: 's1', name: 'Space', type: 'space', access: 'context' }),
        children: [
          { room: roomItem({ id: 'r1', name: 'General' }), children: [] },
          { room: roomItem({ id: 'r2', name: 'Random' }), children: [] },
        ],
      },
    ];
    renderSignedIn(<RoomTree nodes={nodes} collapsed={new Set()} onToggle={() => {}} />, {
      route: '/',
      configure: withUnread(
        { roomId: 'r1', direct: 1, collective: 0 },
        { roomId: 's1', direct: 9, collective: 0 },
      ),
    });

    await screen.findByRole('status', { name: /1 unread mention/ });
    expect(screen.getByRole('link', { name: /General/ })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: /Random/ })).not.toHaveTextContent(/\d/);
    expect(screen.queryByText('9')).toBeNull();
  });
});
