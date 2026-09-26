import { EkozError, NetworkError } from '@ekozhq/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PinsPanel } from '@/features/chat/components/pins-panel';
import { PinsToggle } from '@/features/chat/components/pins-toggle';
import { RoomChat, type RoomChatHandle } from '@/features/chat/components/room-chat';
import { resetActiveRooms } from '@/shared/realtime/active-room';
import { toast } from '@/shared/ui/sonner';
import { type Configure, type Fake, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@/shared/ui/sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/shared/ui/context-menu', () => import('../../../../test/context-menu-mock'));
vi.mock('@/shared/ui/dropdown-menu', () => import('../../../../test/dropdown-menu-mock'));
vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
vi.mock('@/shared/ui/tooltip', () => import('../../../../test/tooltip-mock'));
// The real picker is heavy under jsdom; the stand-in offers one quick emoji and one from the full set.
vi.mock('emoji-picker-react', () => ({
  default: ({
    onReactionClick,
    onEmojiClick,
  }: {
    onReactionClick: (data: { emoji: string }) => void;
    onEmojiClick: (data: { emoji: string }) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onReactionClick({ emoji: '👍' })}>
        quick 👍
      </button>
      <button type="button" onClick={() => onEmojiClick({ emoji: '🦊' })}>
        full 🦊
      </button>
    </div>
  ),
  EmojiStyle: { NATIVE: 'native' },
  Theme: { DARK: 'dark', LIGHT: 'light' },
}));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const ME = defaultMe.id;
const room = { id: 'r1', type: 'channel', readOnly: false };
const BASE = ['room.read', 'room.post'];

function wireMessage(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m${seq}`,
    roomId: 'r1',
    seq: String(seq),
    authorId: 'u1',
    body: `message ${seq}`,
    replyToId: null,
    mentions: [],
    reactions: [],
    editedAt: null,
    redactedAt: null,
    hiddenAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

const member = (id: string, displayName: string | null) => ({
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id, identifier: displayName ? `${id}/example.test` : null, displayName, avatarUrl: null },
});

let seqCounter = 100;
function event(type: string, content: Record<string, unknown>, senderId = 'u2', seq?: number) {
  seqCounter += 1;
  const eventSeq = seq ?? seqCounter;
  return {
    roomId: 'r1',
    feedSeq: String(eventSeq),
    event: {
      type,
      roomId: 'r1',
      seq: String(eventSeq),
      senderId,
      createdAt: '2026-01-01T11:00:00.000Z',
      content,
    },
  };
}

interface SetupOptions {
  items?: unknown[];
  capabilities?: string[];
  configure?: Configure;
  at?: string;
  onJumpToSeq?: (seq: string) => void;
  chatRef?: React.RefObject<RoomChatHandle | null>;
}

function setup({
  items = [wireMessage(1), wireMessage(2, { authorId: ME })],
  capabilities = BASE,
  configure,
  at,
  onJumpToSeq,
  chatRef,
}: SetupOptions = {}) {
  return renderSignedIn(
    <RoomChat
      ref={chatRef}
      room={room}
      capabilities={capabilities}
      membership="member"
      at={at}
      onJumpToSeq={onJumpToSeq}
    />,
    {
      configure: (fake) => {
        fake.stubs.messages.list.mockImplementation(
          async () => ({ items, lastSeq: '2', hasMore: false }) as never,
        );
        fake.stubs.rooms.members.mockImplementation(
          async () =>
            ({
              items: [member('u1', 'Alice'), member('u2', 'Bob'), member(ME, 'Jane Doe')],
              nextCursor: null,
            }) as never,
        );
        configure?.(fake);
      },
    },
  );
}

const emit = (fake: Fake, name: Parameters<Fake['streamControl']['emit']>[0], ...args: unknown[]) =>
  act(() => fake.streamControl.emit(name, ...args));

/** The message row that contains `text`. */
const row = (text: string) =>
  screen
    .getAllByText(text)
    .map((element) => element.closest('li[data-message-id]'))
    .find(Boolean) as HTMLElement;
const rowById = (id: string) => document.querySelector(`[data-message-id="${id}"]`) as HTMLElement;
const menuLabels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

beforeEach(() => {
  createClientMock.mockReset();
  resetActiveRooms();
  seqCounter = 100;
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.error).mockClear();
});

// --- menu ------------------------------------------------------------------

it('offers the same items in the context menu and in the "..." menu', async () => {
  setup({ capabilities: [...BASE, 'room.react', 'room.edit_own', 'room.delete_own', 'room.pin'] });
  await screen.findByText('message 2');

  fireEvent.contextMenu(row('message 2'));
  const contextMenu = screen.getAllByRole('menu').find((menu) => menu.closest('li') === null);
  const dropdown = within(row('message 2')).getByRole('menu');

  expect(menuLabels(dropdown)).toEqual(['Reply', 'React', 'Edit', 'Pin', 'Delete']);
  expect(menuLabels(contextMenu as HTMLElement)).toEqual(menuLabels(dropdown));
});

it('offers less on the message of someone else', async () => {
  setup({ capabilities: [...BASE, 'room.react', 'room.edit_own', 'room.delete_own'] });
  await screen.findByText('message 1');

  expect(menuLabels(within(row('message 1')).getByRole('menu'))).toEqual(['Reply', 'React']);
});

it('shows neither menu nor "..." button when no action is available', async () => {
  setup({ capabilities: ['room.read'] });
  await screen.findByText('message 1');

  expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull();
  fireEvent.contextMenu(row('message 1'));
  expect(screen.queryByRole('menu')).toBeNull();
});

it('offers nothing on a deleted message', async () => {
  setup({
    items: [wireMessage(1, { redactedAt: '2026-01-01T10:05:00.000Z', body: '' })],
    capabilities: [...BASE, 'room.react', 'room.delete_any'],
  });
  await screen.findByText('Message deleted');

  expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull();
});

it('hides Edit outside the edit window announced by the messages policy', async () => {
  setup({
    capabilities: [...BASE, 'room.edit_own'],
    configure: (fake) => {
      fake.stubs.messages.policy.mockResolvedValue({
        bodyMaxLength: 16_000,
        editWindow: 60,
      } as never);
    },
  });
  await screen.findByText('message 2');
  await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull());

  // The message is from 2026-01-01, far outside a one minute window.
  expect(menuLabels(within(row('message 2')).getByRole('menu'))).toEqual(['Reply']);
});

// --- delete ----------------------------------------------------------------

const deleteCapabilities = [...BASE, 'room.delete_own'];

async function openDeleteDialog(user: ReturnType<typeof setup>['user']) {
  await screen.findByText('message 2');
  await user.click(within(row('message 2')).getByRole('menuitem', { name: 'Delete' }));
  return screen.findByRole('dialog', { name: 'Delete this message?' });
}

it('confirms, deletes and turns the message into a tombstone', async () => {
  const { fake, user } = setup({ capabilities: deleteCapabilities });
  const dialog = await openDeleteDialog(user);
  expect(within(dialog).getByText('message 2')).toBeInTheDocument();
  expect(fake.stubs.messages.delete).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(fake.stubs.messages.delete).toHaveBeenCalledWith('r1', 'm2'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('Message deleted')).toBeInTheDocument();
  expect(screen.queryByText('message 2')).toBeNull();
});

it('does nothing on cancel', async () => {
  const { fake, user } = setup({ capabilities: deleteCapabilities });
  const dialog = await openDeleteDialog(user);

  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fake.stubs.messages.delete).not.toHaveBeenCalled();
  expect(screen.getByText('message 2')).toBeInTheDocument();
});

it.each([
  [
    'a permission error',
    new EkozError({ code: 'room.permission_denied', status: 403 }),
    'You do not have permission to delete this message.',
  ],
  [
    'a missing message',
    new EkozError({ code: 'message.not_found', status: 404 }),
    'This message no longer exists.',
  ],
  [
    'a network failure',
    new NetworkError({ code: 'network_error', status: 0 }),
    'The server could not be reached.',
  ],
])('keeps the dialog open with the reason on %s', async (_name, error, text) => {
  const { fake, user } = setup({ capabilities: deleteCapabilities });
  fake.stubs.messages.delete.mockRejectedValue(error);
  const dialog = await openDeleteDialog(user);

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(row('message 2')).toBeInTheDocument();
});

// --- reactions -------------------------------------------------------------

const REACT = [...BASE, 'room.react'];
const withReaction = (emoji: string, userIds: string[]) => [
  wireMessage(1),
  wireMessage(2, { authorId: ME, reactions: [{ emoji, userIds }] }),
];

it('shows a chip per emoji, highlighted when the caller reacted', async () => {
  setup({
    items: [
      wireMessage(1, {
        reactions: [
          { emoji: '👍', userIds: ['u1', 'u2'] },
          { emoji: '🎉', userIds: [ME] },
        ],
      }),
    ],
    capabilities: REACT,
  });

  const others = await screen.findByRole('button', { name: '👍 2' });
  const mine = screen.getByRole('button', { name: '🎉 1' });

  expect(others).toHaveAttribute('aria-pressed', 'false');
  expect(mine).toHaveAttribute('aria-pressed', 'true');
});

it('adds the caller reaction optimistically, then calls react', async () => {
  let done: () => void = () => {};
  const { fake, user } = setup({
    items: withReaction('👍', ['u1']),
    capabilities: REACT,
    configure: (f) => {
      f.stubs.messages.react.mockImplementation(
        () =>
          new Promise<undefined>((resolve) => {
            done = () => resolve(undefined);
          }),
      );
    },
  });

  await user.click(await screen.findByRole('button', { name: '👍 1' }));

  expect(await screen.findByRole('button', { name: '👍 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(fake.stubs.messages.react).toHaveBeenCalledWith('m2', '👍');
  await act(async () => done());
  expect(screen.getByRole('button', { name: '👍 2' })).toBeInTheDocument();
});

it('removes the caller reaction with unreact', async () => {
  const { fake, user } = setup({ items: withReaction('👍', [ME, 'u1']), capabilities: REACT });

  await user.click(await screen.findByRole('button', { name: '👍 2' }));

  expect(await screen.findByRole('button', { name: '👍 1' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(fake.stubs.messages.unreact).toHaveBeenCalledWith('m2', '👍');
});

it('drops the chip when the last reactor leaves', async () => {
  const { user } = setup({ items: withReaction('👍', [ME]), capabilities: REACT });

  await user.click(await screen.findByRole('button', { name: '👍 1' }));

  await waitFor(() => expect(screen.queryByRole('button', { name: /👍/ })).toBeNull());
});

it('treats 409 reaction_already_exists and 404 reaction_not_found as success', async () => {
  const { fake, user } = setup({ items: withReaction('👍', ['u1']), capabilities: REACT });
  fake.stubs.messages.react.mockRejectedValue(
    new EkozError({ code: 'message.reaction_already_exists', status: 409 }),
  );
  await user.click(await screen.findByRole('button', { name: '👍 1' }));
  await waitFor(() => expect(fake.stubs.messages.react).toHaveBeenCalled());

  expect(await screen.findByRole('button', { name: '👍 2' })).toBeInTheDocument();
  expect(toast.error).not.toHaveBeenCalled();

  fake.stubs.messages.unreact.mockRejectedValue(
    new EkozError({ code: 'message.reaction_not_found', status: 404 }),
  );
  await user.click(screen.getByRole('button', { name: '👍 2' }));
  await waitFor(() => expect(fake.stubs.messages.unreact).toHaveBeenCalled());

  expect(await screen.findByRole('button', { name: '👍 1' })).toBeInTheDocument();
  expect(toast.error).not.toHaveBeenCalled();
});

it('reverts the change and shows a toast on any other error', async () => {
  const { fake, user } = setup({ items: withReaction('👍', ['u1']), capabilities: REACT });
  fake.stubs.messages.react.mockRejectedValue(
    new NetworkError({ code: 'network_error', status: 0 }),
  );

  await user.click(await screen.findByRole('button', { name: '👍 1' }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The reaction could not be saved.'));
  expect(await screen.findByRole('button', { name: '👍 1' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('does not toggle a chip without room.react', async () => {
  const { fake, user } = setup({ items: withReaction('👍', ['u1']), capabilities: BASE });

  await user.click(await screen.findByRole('button', { name: '👍 1' }));

  expect(fake.stubs.messages.react).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument();
});

it('lists the reactors by name on hover, with the ones whose account is gone', async () => {
  const { user } = setup({ items: withReaction('👍', ['u1', 'ghost']), capabilities: REACT });

  await user.hover(await screen.findByRole('button', { name: '👍 2' }));

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Alice, Deleted account');
});

it('applies live reaction events, with set semantics on a replay', async () => {
  const { fake } = setup({ capabilities: REACT });
  await screen.findByText('message 1');

  await emit(
    fake,
    'room_event',
    event('reaction_added', { messageId: 'm1', emoji: '🎉' }, 'u2', 3),
  );
  expect(await screen.findByRole('button', { name: '🎉 1' })).toBeInTheDocument();

  await emit(
    fake,
    'room_event',
    event('reaction_added', { messageId: 'm1', emoji: '🎉' }, 'u1', 4),
  );
  expect(await screen.findByRole('button', { name: '🎉 2' })).toBeInTheDocument();

  await emit(
    fake,
    'room_event',
    event('reaction_added', { messageId: 'm1', emoji: '🎉' }, 'u1', 5),
  );
  expect(screen.getByRole('button', { name: '🎉 2' })).toBeInTheDocument();

  await emit(
    fake,
    'room_event',
    event('reaction_removed', { messageId: 'm1', emoji: '🎉' }, 'u1', 6),
  );
  expect(await screen.findByRole('button', { name: '🎉 1' })).toBeInTheDocument();
});

it('clears the chips of a deleted message', async () => {
  const { fake } = setup({ items: withReaction('👍', ['u1']), capabilities: REACT });
  await screen.findByRole('button', { name: '👍 1' });

  await emit(
    fake,
    'room_event',
    event('message_deleted', { messageId: 'm2', messageSeq: '2', reason: 'user' }, ME, 3),
  );

  await waitFor(() => expect(screen.queryByRole('button', { name: /👍/ })).toBeNull());
  expect(screen.getByText('Message deleted')).toBeInTheDocument();
});

it('keeps the reactions when an edit refetch answers with an older list', async () => {
  const { fake } = setup({ items: withReaction('👍', ['u1']), capabilities: REACT });
  await screen.findByRole('button', { name: '👍 1' });
  fake.stubs.messages.get.mockResolvedValue(
    wireMessage(2, {
      authorId: ME,
      body: 'edited body',
      editedAt: '2026-01-01T12:00:00.000Z',
    }) as never,
  );

  await emit(
    fake,
    'room_event',
    event('message_edited', { messageId: 'm2', editedAt: '2026-01-01T12:00:00.000Z' }, ME, 3),
  );

  expect(await screen.findByText('edited body')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument();
});

it('reacts from the picker: a quick emoji and one from the full set', async () => {
  const { fake, user } = setup({ capabilities: REACT });
  await screen.findByText('message 1');

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'React' }));
  await user.click(await screen.findByRole('button', { name: 'quick 👍' }));

  await waitFor(() => expect(fake.stubs.messages.react).toHaveBeenCalledWith('m1', '👍'));
  expect(await screen.findByRole('button', { name: '👍 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'quick 👍' })).toBeNull();

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'React' }));
  await user.click(await screen.findByRole('button', { name: 'full 🦊' }));

  await waitFor(() => expect(fake.stubs.messages.react).toHaveBeenCalledWith('m1', '🦊'));
});

// --- replies ---------------------------------------------------------------

const composer = () => screen.getByRole('textbox', { name: 'Message' });

it('sets a reply target from the menu, shows the banner and sends with replyToId', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 1');

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Reply' }));

  const banner = await screen.findByTestId('reply-banner');
  expect(banner).toHaveTextContent('Replying to Alice');
  expect(banner).toHaveTextContent('message 1');

  await user.type(composer(), 'an answer{Enter}');

  await waitFor(() =>
    expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', {
      body: 'an answer',
      replyToId: 'm1',
    }),
  );
  expect(screen.queryByTestId('reply-banner')).toBeNull();
});

it('clears the reply target on cancel and sends a plain message afterwards', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 1');
  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Reply' }));

  await user.click(await screen.findByRole('button', { name: 'Cancel reply' }));
  expect(screen.queryByTestId('reply-banner')).toBeNull();
  await user.type(composer(), 'plain{Enter}');

  await waitFor(() =>
    expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', { body: 'plain' }),
  );
});

it('shows the quote of a reply whose parent is loaded', async () => {
  const { fake } = setup({ items: [wireMessage(1), wireMessage(2, { replyToId: 'm1' })] });

  const quote = await screen.findByTestId('reply-quote');

  expect(quote).toHaveTextContent('Alice');
  expect(quote).toHaveTextContent('message 1');
  expect(fake.stubs.messages.get).not.toHaveBeenCalled();
});

it('fetches an unloaded parent once and quotes it', async () => {
  const { fake } = setup({
    items: [wireMessage(5, { replyToId: 'm1', authorId: 'u2' })],
    configure: (f) => {
      f.stubs.messages.get.mockResolvedValue(wireMessage(1, { body: 'the parent' }) as never);
    },
  });

  const quote = await screen.findByTestId('reply-quote');

  await waitFor(() => expect(quote).toHaveTextContent('the parent'));
  expect(quote).toHaveTextContent('Alice');
  expect(fake.stubs.messages.get).toHaveBeenCalledTimes(1);
  expect(fake.stubs.messages.get).toHaveBeenCalledWith('r1', 'm1');
});

it('reads "Message deleted" for a deleted parent, without a link', async () => {
  setup({
    items: [
      wireMessage(1, { redactedAt: '2026-01-01T10:05:00.000Z', body: '' }),
      wireMessage(2, { replyToId: 'm1' }),
    ],
  });

  const quote = await screen.findByTestId('reply-quote');

  expect(quote).toHaveTextContent('Message deleted');
  expect(quote.tagName).not.toBe('BUTTON');
});

it('reads "Message unavailable" when the parent cannot be fetched', async () => {
  setup({
    items: [wireMessage(5, { replyToId: 'gone' })],
    configure: (f) => {
      f.stubs.messages.get.mockRejectedValue(
        new EkozError({ code: 'message.not_found', status: 404 }),
      );
    },
  });

  expect(await screen.findByText('Message unavailable')).toBeInTheDocument();
});

it('updates a quote live when its parent is edited or deleted', async () => {
  const { fake } = setup({ items: [wireMessage(1), wireMessage(2, { replyToId: 'm1' })] });
  await screen.findByTestId('reply-quote');

  await emit(
    fake,
    'room_event',
    event('message_deleted', { messageId: 'm1', messageSeq: '1', reason: 'user' }, 'u1', 3),
  );

  await waitFor(() =>
    expect(screen.getByTestId('reply-quote')).toHaveTextContent('Message deleted'),
  );
});

it('shows the quote of a pending reply', async () => {
  const { user } = setup({ capabilities: BASE });
  await screen.findByText('message 1');
  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Reply' }));
  await user.type(composer(), 'pending answer{Enter}');

  await screen.findByText('pending answer');

  const pending = screen.getByText('pending answer').closest('li') as HTMLElement;
  expect(within(pending).getByTestId('reply-quote')).toHaveTextContent('message 1');
});

it('keeps replyToId when a failed reply is retried', async () => {
  const { fake, user } = setup();
  fake.stubs.messages.send.mockRejectedValueOnce(
    new NetworkError({ code: 'network_error', status: 0 }),
  );
  await screen.findByText('message 1');
  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Reply' }));
  await user.type(composer(), 'retry me{Enter}');

  await user.click(await screen.findByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(fake.stubs.messages.send).toHaveBeenCalledTimes(2));
  expect(fake.stubs.messages.send).toHaveBeenLastCalledWith('r1', {
    body: 'retry me',
    replyToId: 'm1',
  });
});

// --- jump ------------------------------------------------------------------

it('jumps in place to a parent that is loaded: scroll and outline', async () => {
  const onJumpToSeq = vi.fn();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const { user } = setup({
    items: [wireMessage(1), wireMessage(2, { replyToId: 'm1' })],
    onJumpToSeq,
  });

  await user.click(await screen.findByRole('button', { name: 'Go to the original message' }));

  expect(scrollIntoView).toHaveBeenCalled();
  expect(rowById('m1')).toHaveAttribute('data-jump-target');
  expect(onJumpToSeq).not.toHaveBeenCalled();
});

it('jumps to an unloaded parent through its seq', async () => {
  const onJumpToSeq = vi.fn();
  const { user } = setup({
    items: [wireMessage(50, { replyToId: 'm7' })],
    onJumpToSeq,
    configure: (f) => {
      f.stubs.messages.get.mockResolvedValue(wireMessage(7, { body: 'far away' }) as never);
    },
  });
  await waitFor(() => expect(screen.getByTestId('reply-quote')).toHaveTextContent('far away'));

  await user.click(screen.getByRole('button', { name: 'Go to the original message' }));

  await waitFor(() => expect(onJumpToSeq).toHaveBeenCalledWith('7'));
});

it('jumps to a message by id for the pins panel: in place, or through the seq it knows', async () => {
  const onJumpToSeq = vi.fn();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const chatRef = createRef<RoomChatHandle>();
  setup({ chatRef, onJumpToSeq });
  await screen.findByText('message 1');

  act(() => chatRef.current?.jumpToMessage('m1', '1'));
  expect(rowById('m1')).toHaveAttribute('data-jump-target');
  expect(onJumpToSeq).not.toHaveBeenCalled();

  act(() => chatRef.current?.jumpToMessage('m99', '99'));
  expect(onJumpToSeq).toHaveBeenCalledWith('99');
});

// --- pins ------------------------------------------------------------------

const pin = (seq: number, overrides: Record<string, unknown> = {}, messageOverrides = {}) => ({
  roomId: 'r1',
  messageId: `m${seq}`,
  pinnedById: 'u2',
  pinnedAt: `2026-01-01T12:0${seq}:00.000Z`,
  message: wireMessage(seq, messageOverrides),
  ...overrides,
});

it('marks a pinned message and offers Unpin, then Pin on the others', async () => {
  setup({
    capabilities: [...BASE, 'room.pin'],
    configure: (f) => {
      f.stubs.messages.pins.mockResolvedValue([pin(1)] as never);
    },
  });
  await screen.findByText('message 2');

  await waitFor(() =>
    expect(within(row('message 1')).getByRole('img', { name: 'Pinned' })).toBeInTheDocument(),
  );
  expect(menuLabels(within(row('message 1')).getByRole('menu'))).toEqual(['Reply', 'Unpin']);
  expect(menuLabels(within(row('message 2')).getByRole('menu'))).toEqual(['Reply', 'Pin']);
});

it('pins and unpins, and counts a conflict as success', async () => {
  const { fake, user } = setup({ capabilities: [...BASE, 'room.pin'] });
  await screen.findByText('message 1');

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Pin' }));
  await waitFor(() => expect(fake.stubs.messages.pin).toHaveBeenCalledWith('r1', 'm1'));

  fake.stubs.messages.pin.mockRejectedValue(
    new EkozError({ code: 'message.already_pinned', status: 409 }),
  );
  await user.click(within(row('message 2')).getByRole('menuitem', { name: 'Pin' }));
  await waitFor(() => expect(fake.stubs.messages.pin).toHaveBeenCalledWith('r1', 'm2'));

  fake.stubs.messages.unpin.mockRejectedValue(
    new EkozError({ code: 'message.not_pinned', status: 404 }),
  );
  fake.stubs.messages.pins.mockResolvedValue([pin(1)] as never);
  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Pin' }));

  expect(toast.error).not.toHaveBeenCalled();
});

it('shows a toast when pinning fails for another reason', async () => {
  const { fake, user } = setup({ capabilities: [...BASE, 'room.pin'] });
  fake.stubs.messages.pin.mockRejectedValue(new NetworkError({ code: 'network_error', status: 0 }));
  await screen.findByText('message 1');

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Pin' }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The message could not be pinned.'));
});

it('refetches the pins on pin_added and drops an entry on message_deleted', async () => {
  const { fake } = setup({
    capabilities: [...BASE, 'room.pin'],
    configure: (f) => {
      f.stubs.messages.pins.mockResolvedValue([pin(1)] as never);
    },
  });
  await waitFor(() =>
    expect(within(row('message 1')).getByRole('img', { name: 'Pinned' })).toBeInTheDocument(),
  );
  fake.stubs.messages.pins.mockResolvedValue([pin(2), pin(1)] as never);

  await emit(fake, 'room_event', event('pin_added', { messageId: 'm2' }, 'u2', 3));

  await waitFor(() =>
    expect(within(row('message 2')).getByRole('img', { name: 'Pinned' })).toBeInTheDocument(),
  );

  await emit(
    fake,
    'room_event',
    event('message_deleted', { messageId: 'm1', messageSeq: '1', reason: 'user' }, 'u1', 4),
  );

  await waitFor(() => expect(screen.getByText('Message deleted')).toBeInTheDocument());
  expect(screen.queryAllByRole('img', { name: 'Pinned' })).toHaveLength(1);
});

it('does not fetch the pins for someone who cannot read the room', async () => {
  const { fake } = setup({ capabilities: ['room.post'] });
  await screen.findByText('message 1');

  expect(fake.stubs.messages.pins).not.toHaveBeenCalled();
});

function renderPins({
  pins,
  enabled = true,
  onSelect = vi.fn(),
}: {
  pins: unknown[] | Error;
  enabled?: boolean;
  onSelect?: () => void;
}) {
  return renderSignedIn(
    <>
      <PinsToggle roomId="r1" enabled={enabled} open={false} onToggle={() => {}} />
      <PinsPanel roomId="r1" enabled={enabled} open onOpenChange={() => {}} onSelect={onSelect} />
    </>,
    {
      configure: (fake) => {
        if (pins instanceof Error) fake.stubs.messages.pins.mockRejectedValue(pins);
        else fake.stubs.messages.pins.mockResolvedValue(pins as never);
        fake.stubs.rooms.members.mockResolvedValue({
          items: [member('u1', 'Alice'), member('u2', 'Bob')],
          nextCursor: null,
        } as never);
      },
    },
  );
}

it('counts the visible pins in the toggle and lists them newest first in the panel', async () => {
  renderPins({
    pins: [
      pin(3, {}, { authorId: 'u2' }),
      pin(2, { pinnedById: 'u1' }),
      pin(4, {}, { hiddenAt: '2026-01-01T13:00:00.000Z' }),
      pin(1, {}, { redactedAt: '2026-01-01T13:00:00.000Z', body: '' }),
    ],
  });

  const list = await screen.findByRole('list', { name: 'Pinned messages' });

  const entries = within(list).getAllByRole('listitem');
  expect(entries).toHaveLength(2);
  expect(entries[0]).toHaveTextContent('message 3');
  expect(entries[1]).toHaveTextContent('message 2');
  await waitFor(() => expect(entries[0]).toHaveTextContent('Pinned by Bob'));
  expect(entries[0]).toHaveTextContent('Bob');
  expect(entries[1]).toHaveTextContent('Pinned by Alice');
  expect(screen.getByRole('button', { name: /^Pinned\s*2$/, hidden: true })).toBeInTheDocument();
});

it('shows an empty panel, and nothing when the pins are refused', async () => {
  const { unmount } = renderPins({ pins: [] });
  expect(await screen.findByText('No pinned messages.')).toBeInTheDocument();
  unmount();

  renderPins({ pins: new EkozError({ code: 'room.permission_denied', status: 403 }) });
  expect(await screen.findByText('No pinned messages.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pinned', hidden: true })).toBeInTheDocument();
});

it('closes the panel and reports the pin when an entry is chosen', async () => {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const { user } = renderSignedIn(
    <PinsPanel roomId="r1" open onOpenChange={onOpenChange} onSelect={onSelect} />,
    {
      configure: (fake) => {
        fake.stubs.messages.pins.mockResolvedValue([pin(2)] as never);
      },
    },
  );

  await user.click(await screen.findByRole('button', { name: /message 2/ }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm2' }));
});

// --- inline edit -----------------------------------------------------------

const EDIT = [...BASE, 'room.edit_own'];
const editor = () => screen.findByRole('textbox', { name: 'Edit message' });

async function startEdit(user: ReturnType<typeof setup>['user'], text = 'message 2') {
  await screen.findByText(text);
  await user.click(within(row(text)).getByRole('menuitem', { name: 'Edit' }));
  return editor();
}

it('swaps the body for an editor holding it, and saves with Enter', async () => {
  const { fake, user } = setup({ capabilities: EDIT });
  fake.stubs.messages.edit.mockResolvedValue(
    wireMessage(2, {
      authorId: ME,
      body: 'message 2 changed',
      editedAt: '2026-01-01T12:00:00.000Z',
    }) as never,
  );
  const box = await startEdit(user);
  await waitFor(() => expect(box).toHaveTextContent('message 2'));

  await user.type(box, ' changed{Enter}');

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm2', {
      body: 'message 2 changed',
      mentions: [],
    }),
  );
  expect(await screen.findByText('message 2 changed')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
  expect(screen.getByText('(edited)')).toBeInTheDocument();
});

it('keeps the local reactions when the save answers', async () => {
  const { fake, user } = setup({
    items: [wireMessage(2, { authorId: ME, reactions: [{ emoji: '👍', userIds: ['u1'] }] })],
    capabilities: EDIT,
  });
  fake.stubs.messages.edit.mockResolvedValue(
    wireMessage(2, { authorId: ME, body: 'message 2!', reactions: [] }) as never,
  );
  const box = await startEdit(user);
  await user.type(box, '!');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('message 2!')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument();
});

it('cancels without a request when the body is unchanged', async () => {
  const { fake, user } = setup({ capabilities: EDIT });
  const box = await startEdit(user);
  await waitFor(() => expect(box).toHaveTextContent('message 2'));

  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(fake.stubs.messages.edit).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull());
  expect(screen.getByText('message 2')).toBeInTheDocument();
});

it('cancels with the button and with Escape, keeping the original body', async () => {
  const { fake, user } = setup({ capabilities: EDIT });
  let box = await startEdit(user);
  await user.type(box, ' draft');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
  expect(screen.getByText('message 2')).toBeInTheDocument();

  box = await startEdit(user);
  await user.type(box, '{Escape}');

  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull());
  expect(fake.stubs.messages.edit).not.toHaveBeenCalled();
});

it('disables Save for an empty body', async () => {
  const { user } = setup({ capabilities: EDIT });
  const box = await startEdit(user);
  await waitFor(() => expect(box).toHaveTextContent('message 2'));
  await user.type(box, '{Backspace}'.repeat(12));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
});

it.each([
  [
    'permission_denied',
    new EkozError({ code: 'room.permission_denied', status: 403 }),
    'You can no longer edit this message.',
  ],
  [
    'body_too_long',
    new EkozError({ code: 'message.body_too_long', status: 422 }),
    'This message is too long.',
  ],
  [
    'body_invalid',
    new EkozError({ code: 'message.body_invalid', status: 422 }),
    'This message is not valid.',
  ],
  [
    'network',
    new NetworkError({ code: 'network_error', status: 0 }),
    'The server could not be reached.',
  ],
])('keeps the editor open with an inline message on %s', async (_name, error, text) => {
  const { fake, user } = setup({ capabilities: EDIT });
  fake.stubs.messages.edit.mockRejectedValue(error);
  const box = await startEdit(user);
  await user.type(box, '!');

  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(text);
  expect(screen.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
});

it('closes the editor when the message no longer exists', async () => {
  const { fake, user } = setup({ capabilities: EDIT });
  fake.stubs.messages.edit.mockRejectedValue(
    new EkozError({ code: 'message.not_found', status: 404 }),
  );
  const box = await startEdit(user);
  await user.type(box, '!');

  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull());
});

it('leaves the draft alone on a remote edit, and closes the editor with a notice on a remote deletion', async () => {
  const { fake, user } = setup({ capabilities: EDIT });
  fake.stubs.messages.get.mockResolvedValue(
    wireMessage(2, {
      authorId: ME,
      body: 'remote body',
      editedAt: '2026-01-01T12:00:00.000Z',
    }) as never,
  );
  const box = await startEdit(user);
  await user.type(box, '!');

  await emit(
    fake,
    'room_event',
    event('message_edited', { messageId: 'm2', editedAt: '2026-01-01T12:00:00.000Z' }, ME, 3),
  );

  await waitFor(() => expect(fake.stubs.messages.get).toHaveBeenCalled());
  expect(screen.getByRole('textbox', { name: 'Edit message' })).toHaveTextContent('message 2!');

  await emit(
    fake,
    'room_event',
    event('message_deleted', { messageId: 'm2', messageSeq: '2', reason: 'user' }, ME, 4),
  );

  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull());
  expect(toast.info).toHaveBeenCalledWith('The message you were editing was deleted.');
  expect(screen.getByText('Message deleted')).toBeInTheDocument();
});

it('edits one message at a time, asking before discarding a changed draft', async () => {
  const { user } = setup({
    items: [wireMessage(1, { authorId: ME }), wireMessage(2, { authorId: ME })],
    capabilities: EDIT,
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  let box = await startEdit(user, 'message 1');
  await user.type(box, '!');

  await user.click(within(row('message 2')).getByRole('menuitem', { name: 'Edit' }));
  expect(confirm).toHaveBeenCalledWith('Discard your changes to the message being edited?');
  expect(screen.getAllByRole('textbox', { name: 'Edit message' })).toHaveLength(1);
  expect(within(row('message 1!')).queryByRole('textbox')).not.toBeNull();

  confirm.mockReturnValue(true);
  await user.click(within(row('message 2')).getByRole('menuitem', { name: 'Edit' }));

  box = await editor();
  await waitFor(() => expect(box).toHaveTextContent('message 2'));
  expect(screen.getAllByRole('textbox', { name: 'Edit message' })).toHaveLength(1);
  confirm.mockRestore();
});

it('closes the edit when a reply starts, without asking for an unchanged draft', async () => {
  const { user } = setup({ capabilities: EDIT });
  const confirm = vi.spyOn(window, 'confirm');
  await startEdit(user);

  await user.click(within(row('message 1')).getByRole('menuitem', { name: 'Reply' }));

  expect(confirm).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull());
  expect(await screen.findByTestId('reply-banner')).toBeInTheDocument();
  confirm.mockRestore();
});

it('shows the edit date on hover of the "(edited)" label', async () => {
  setup({ items: [wireMessage(1, { editedAt: '2026-01-01T12:00:00.000Z' })] });

  const label = await screen.findByText('(edited)');

  expect(label).toHaveAttribute('title', expect.stringMatching(/^Edited .*2026/));
});

it('loads the mentions of a message as chips and sends them back when saving', async () => {
  const { fake, user } = setup({
    items: [
      wireMessage(2, {
        authorId: ME,
        body: 'hi @u2/example.test',
        mentions: [{ type: 'user', target: 'u2', token: '@u2/example.test' }],
      }),
    ],
    capabilities: EDIT,
  });
  fake.stubs.messages.edit.mockResolvedValue(wireMessage(2, { authorId: ME }) as never);
  const box = await startEdit(user, 'hi');
  await waitFor(() => expect(box.querySelector('[data-type="mention"]')).not.toBeNull());
  expect(box.querySelector('[data-type="mention"]')).toHaveTextContent('@Bob');

  await user.type(box, ' there');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(fake.stubs.messages.edit).toHaveBeenCalledWith('r1', 'm2', {
      body: 'hi @u2/example.test there',
      mentions: [{ type: 'user', userId: 'u2' }],
    }),
  );
});

it('shows the latest visible pin under the header and jumps to it', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  setup({
    capabilities: [...BASE, 'room.pin'],
    configure: (f) => {
      f.stubs.messages.pins.mockResolvedValue([
        pin(2, {}, { hiddenAt: '2026-01-01T13:00:00.000Z' }),
        pin(1),
      ] as never);
    },
  });

  const banner = await screen.findByTestId('pinned-banner');

  expect(banner).toHaveTextContent('message 1');
  fireEvent.click(banner);
  expect(rowById('m1')).toHaveAttribute('data-jump-target');
});

it('shows no pinned banner without pins', async () => {
  setup();
  await screen.findByText('message 1');

  expect(screen.queryByTestId('pinned-banner')).toBeNull();
});

it('shows only the first line of a multi-line pin, with an ellipsis', async () => {
  setup({
    configure: (f) => {
      f.stubs.messages.pins.mockResolvedValue([
        pin(1, {}, { body: 'first line\nsecond line\nthird' }),
      ] as never);
    },
  });

  const banner = await screen.findByTestId('pinned-banner');

  expect(banner).toHaveTextContent('first line...');
  expect(banner).not.toHaveTextContent('second line');
});
