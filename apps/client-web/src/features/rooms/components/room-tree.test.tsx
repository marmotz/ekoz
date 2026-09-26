import { screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomTree } from '@/features/rooms/components/room-tree';
import { resetPresence, setPresence } from '@/shared/realtime/presence-store';
import { resetTyping, setTyping } from '@/shared/realtime/typing-store';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
  resetTyping();
});
afterEach(() => {
  resetTyping();
});

const nodes = [
  { room: roomItem({ id: 'r1', name: 'General' }), children: [], descendantsUnread: 0 },
  { room: roomItem({ id: 'r2', name: 'Random' }), children: [], descendantsUnread: 0 },
];

const tree = () => <RoomTree nodes={nodes} collapsed={new Set()} onToggle={() => {}} />;
const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) });

describe('RoomTree typing indicator', () => {
  it('shows animated dots on a room where someone types, and only there', async () => {
    renderSignedIn(tree(), { route: '/' });
    await screen.findByRole('link', { name: /General/ });

    act(() => setTyping('r2', 'someone', 60));

    expect(
      within(row('Random')).getByRole('img', { name: 'Someone is typing' }),
    ).toBeInTheDocument();
    expect(within(row('General')).queryByRole('img')).not.toBeInTheDocument();
  });

  it('hides the dots when the typing stops', async () => {
    renderSignedIn(tree(), { route: '/' });
    await screen.findByRole('link', { name: /General/ });
    act(() => setTyping('r2', 'someone', 60));

    act(() => resetTyping());

    expect(screen.queryByRole('img', { name: 'Someone is typing' })).not.toBeInTheDocument();
  });

  it('shows no dots on the room that is open', async () => {
    renderSignedIn(tree(), { route: '/rooms/r2' });
    await screen.findByRole('link', { name: /General/ });

    act(() => setTyping('r2', 'someone', 60));

    expect(screen.queryByRole('img', { name: 'Someone is typing' })).not.toBeInTheDocument();
  });
});

describe('RoomTree direct conversation presence', () => {
  const member = (id: string, name: string) => ({
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id, identifier: `${name}/example.test`, displayName: name, avatarUrl: null },
  });

  it('shows the presence of the partner on a dm row only', async () => {
    resetPresence();
    setPresence('u2', 'away');
    const dmNodes = [
      {
        room: roomItem({ id: 'd1', name: 'Alice', type: 'dm' }),
        children: [],
        descendantsUnread: 0,
      },
      { room: roomItem({ id: 'r1', name: 'General' }), children: [], descendantsUnread: 0 },
    ];
    renderSignedIn(<RoomTree nodes={dmNodes} collapsed={new Set()} onToggle={() => {}} />, {
      route: '/',
      configure: ({ stubs }) => {
        stubs.me.get.mockResolvedValue({ id: 'me', displayName: 'Jane' } as never);
        stubs.rooms.members.mockResolvedValue({
          items: [member('me', 'jane'), member('u2', 'alice')],
          nextCursor: null,
        } as never);
      },
    });

    expect(
      await within(await screen.findByRole('link', { name: /Alice/ })).findByRole('img', {
        name: 'Away',
      }),
    ).toBeInTheDocument();
    expect(within(row('General')).queryByRole('img')).not.toBeInTheDocument();
    resetPresence();
  });
});
