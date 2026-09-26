import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useUnreadMessagesTotal } from '@/features/rooms/hooks/use-unread-messages-total';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { roomItem } from '../../../../test/room-fixtures';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

function Total() {
  return <p data-testid="total">{useUnreadMessagesTotal()}</p>;
}

beforeEach(() => {
  createClientMock.mockReset();
});

it('sums the unread counters, null counting as 0', async () => {
  renderSignedIn(<Total />, {
    configure: ({ stubs }) => {
      stubs.rooms.list.mockResolvedValue({
        items: [
          roomItem({ id: 'a', unreadCount: 2 }),
          roomItem({ id: 'b', unreadCount: 5 }),
          roomItem({ id: 'c', unreadCount: null }),
        ],
      });
    },
  });

  expect(await screen.findByText('7')).toBeInTheDocument();
});
