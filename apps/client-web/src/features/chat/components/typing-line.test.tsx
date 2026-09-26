import { screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TypingLine } from '@/features/chat/components/typing-line';
import { resetTyping, setTyping } from '@/shared/realtime/typing-store';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const member = (id: string, name: string) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id,
    identifier: `${name.toLowerCase()}/example.test`,
    displayName: name,
    avatarUrl: null,
  },
});

beforeEach(() => {
  createClientMock.mockReset();
  resetTyping();
});
afterEach(() => {
  resetTyping();
});

function setup() {
  return renderSignedIn(<TypingLine roomId="r1" />, {
    configure: (fake) =>
      fake.stubs.rooms.members.mockResolvedValue({
        items: [
          member('a', 'Alice'),
          member('b', 'Bob'),
          member('c', 'Carol'),
          member('d', 'Dave'),
        ],
        nextCursor: null,
      } as never),
  });
}

const typing = (...ids: string[]) =>
  act(() => {
    for (const id of ids) setTyping('r1', id, 60);
  });

it('is an empty polite live region when nobody types, keeping its height', async () => {
  setup();

  await waitFor(() => expect(document.querySelector('[aria-live="polite"]')).not.toBeNull());
  const line = document.querySelector('[aria-live="polite"]');
  expect(line).toHaveTextContent('');
  expect(line?.className).toContain('h-5');
});

it('names one person', async () => {
  setup();

  typing('a');

  expect(await screen.findByText('Alice is typing…')).toBeInTheDocument();
});

it('names two people', async () => {
  setup();

  typing('a', 'b');

  expect(await screen.findByText('Alice and Bob are typing…')).toBeInTheDocument();
});

it('names three people', async () => {
  setup();

  typing('a', 'b', 'c');

  expect(await screen.findByText('Alice, Bob and Carol are typing…')).toBeInTheDocument();
});

it('stops naming beyond three people', async () => {
  setup();

  typing('a', 'b', 'c', 'd');

  expect(await screen.findByText('Several people are typing…')).toBeInTheDocument();
});

it('empties when they stop', async () => {
  setup();
  typing('a');
  await screen.findByText('Alice is typing…');

  act(() => resetTyping());

  expect(screen.queryByText('Alice is typing…')).not.toBeInTheDocument();
});
