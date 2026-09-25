import { EkozError, NetworkError } from '@ekozhq/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { RoomChat } from '@/features/chat/components/room-chat';
import { getActiveRoom, markUnseen, resetUnseenRooms } from '@/shared/realtime/unseen-rooms';
import { toast } from '@/shared/ui/sonner';
import { type Configure, type Fake, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@/shared/ui/sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const room = { id: 'r1', type: 'channel', readOnly: false };
const CAN_POST = ['room.read', 'room.post'];

function wireMessage(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m${seq}`,
    roomId: 'r1',
    seq: String(seq),
    authorId: 'u1',
    body: `message ${seq}`,
    replyToId: null,
    mentions: [],
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

function created(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    roomId: 'r1',
    feedSeq: String(seq),
    event: {
      type: 'message_created',
      roomId: 'r1',
      seq: String(seq),
      senderId: 'u2',
      createdAt: '2026-01-01T11:00:00.000Z',
      content: { messageId: `m${seq}`, body: `live ${seq}`, replyToId: null, mentions: [] },
      ...overrides,
    },
  };
}

interface SetupOptions {
  items?: unknown[];
  hasMore?: boolean;
  lastSeq?: string;
  members?: unknown[];
  capabilities?: string[];
  membership?: 'member' | 'invited' | 'joinable';
  room?: { id: string; type: string; readOnly: boolean };
  configure?: Configure;
  at?: string;
  onJumpToLatest?: () => void;
}

function setup({
  items = [wireMessage(1), wireMessage(2)],
  hasMore = false,
  lastSeq = '2',
  members = [member('u1', 'Alice'), member('u2', 'Bob')],
  capabilities = CAN_POST,
  membership = 'member',
  room: roomProp = room,
  configure,
  at,
  onJumpToLatest,
}: SetupOptions = {}) {
  return renderSignedIn(
    <RoomChat
      room={roomProp}
      capabilities={capabilities}
      membership={membership}
      at={at}
      onJumpToLatest={onJumpToLatest}
    />,
    {
      configure: (fake) => {
        fake.stubs.messages.list.mockImplementation(
          async () => ({ items, lastSeq, hasMore }) as never,
        );
        fake.stubs.rooms.members.mockImplementation(
          async () => ({ items: members, nextCursor: null }) as never,
        );
        configure?.(fake);
      },
    },
  );
}

const emit = (fake: Fake, name: Parameters<Fake['streamControl']['emit']>[0], ...args: unknown[]) =>
  act(() => fake.streamControl.emit(name, ...args));

beforeEach(() => {
  createClientMock.mockReset();
  resetUnseenRooms();
  vi.mocked(toast.info).mockClear();
});

// --- history ---------------------------------------------------------------

it('loads and shows the newest page with the author names', async () => {
  const { fake } = setup();

  expect(await screen.findByText('message 1')).toBeInTheDocument();
  expect(screen.getByText('message 2')).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenCalledWith('r1');
  await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
});

it('shows an empty state without messages', async () => {
  setup({ items: [], lastSeq: '0' });

  expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
});

it('loads older messages when scrolled to the top and keeps them in order', async () => {
  const { fake } = setup({ items: [wireMessage(3), wireMessage(4)], hasMore: true, lastSeq: '4' });
  await screen.findByText('message 3');
  fake.stubs.messages.list.mockImplementation(
    async () =>
      ({ items: [wireMessage(1), wireMessage(2)], lastSeq: '4', hasMore: false }) as never,
  );

  const scroller = screen.getByRole('list').parentElement as HTMLElement;
  scroller.scrollTop = 0;
  fireEvent.scroll(scroller);

  expect(await screen.findByText('message 1')).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenLastCalledWith('r1', { before: '3' });
  const order = within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('data-message-id'));
  expect(order).toEqual(['m1', 'm2', 'm3', 'm4']);
  expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
});

it('loads older messages from the button and reports a failure', async () => {
  const { fake, user } = setup({ items: [wireMessage(3)], hasMore: true, lastSeq: '3' });
  await screen.findByText('message 3');
  fake.stubs.messages.list.mockRejectedValueOnce(
    new NetworkError({ code: 'network_error', status: 0 }),
  );

  await user.click(screen.getByRole('button', { name: 'Load older messages' }));
  const retry = await screen.findByRole('button', { name: /Could not load older messages/ });

  fake.stubs.messages.list.mockResolvedValueOnce({
    items: [wireMessage(2)],
    lastSeq: '3',
    hasMore: false,
  } as never);
  await user.click(retry);

  expect(await screen.findByText('message 2')).toBeInTheDocument();
});

it('keeps the scroll anchor when older messages are prepended', async () => {
  const heights = { value: 300 };
  const spy = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(() => heights.value);
  try {
    const { fake } = setup({ items: [wireMessage(3)], hasMore: true, lastSeq: '3' });
    await screen.findByText('message 3');
    fake.stubs.messages.list.mockImplementation(async () => {
      heights.value = 500;
      return { items: [wireMessage(2)], lastSeq: '3', hasMore: false } as never;
    });
    const scroller = screen.getByRole('list').parentElement as HTMLElement;
    scroller.scrollTop = 0;

    fireEvent.scroll(scroller);
    await screen.findByText('message 2');

    expect(scroller.scrollTop).toBe(200);
  } finally {
    spy.mockRestore();
  }
});

it('shows the author labels for deleted accounts and for authors who left', async () => {
  const { fake } = setup({
    items: [
      wireMessage(1, { authorId: null }),
      wireMessage(2, { authorId: 'u3' }),
      wireMessage(3, { authorId: 'gone' }),
      wireMessage(4, { authorId: 'wiped' }),
    ],
    lastSeq: '4',
    members: [member('u3', null), member('u1', 'Alice')],
    configure: (f) => {
      f.stubs.users.summaries.mockImplementation(async (ids: readonly string[]) =>
        ids.map((id) => ({
          id,
          identifier: id === 'gone' ? 'gone/example.test' : null,
          displayName: id === 'gone' ? 'Gone Person' : null,
          avatarUrl: null,
        })),
      );
    },
  });

  await screen.findByText('message 4');

  expect(await screen.findByText('Gone Person')).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByText('Deleted account')).toHaveLength(3));
  expect(screen.queryByText('Unknown user')).not.toBeInTheDocument();
  expect(fake.stubs.users.summaries).toHaveBeenCalledTimes(1);
  expect(fake.stubs.users.summaries).toHaveBeenCalledWith(['gone', 'wiped']);
  // The members list is not fetched again to find them.
  expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(1);
});

it('shows a name placeholder while an author who left is being looked up', async () => {
  let release: (summaries: unknown[]) => void = () => {};
  setup({
    items: [wireMessage(1, { authorId: 'gone' })],
    lastSeq: '1',
    configure: (f) => {
      f.stubs.users.summaries.mockImplementation(
        () => new Promise((resolve) => (release = resolve)) as never,
      );
    },
  });

  expect(await screen.findByTestId('author-pending')).toBeInTheDocument();

  await act(async () => {
    release([
      { id: 'gone', identifier: 'gone/example.test', displayName: 'Gone', avatarUrl: null },
    ]);
  });

  expect(await screen.findByText('Gone')).toBeInTheDocument();
  expect(screen.queryByTestId('author-pending')).not.toBeInTheDocument();
});

it('renders a tombstone for a deleted message and an edited marker', async () => {
  setup({
    items: [
      wireMessage(1, { body: '', redactedAt: '2026-01-02T00:00:00.000Z' }),
      wireMessage(2, { body: 'fixed text', editedAt: '2026-01-02T00:00:00.000Z' }),
    ],
    lastSeq: '2',
  });

  expect(await screen.findByText('Message deleted')).toBeInTheDocument();
  expect(screen.getByText('fixed text')).toBeInTheDocument();
  expect(screen.getByText('(edited)')).toBeInTheDocument();
  expect(screen.getAllByText('(edited)')).toHaveLength(1);
});

it('does not render hidden messages', async () => {
  setup({
    items: [wireMessage(1, { hiddenAt: '2026-01-02T00:00:00.000Z' }), wireMessage(2)],
    lastSeq: '2',
  });

  await screen.findByText('message 2');
  expect(screen.queryByText('message 1')).toBeNull();
});

it('renders message bodies as sanitised markdown', async () => {
  setup({
    items: [wireMessage(1, { body: '**bold** <script>x</script> [go](javascript:alert(1))' })],
    lastSeq: '1',
  });

  const bold = await screen.findByText('bold');
  expect(bold.tagName).toBe('STRONG');
  expect(document.querySelector('script')).toBeNull();
});

it('shows the error state on a 403 and loads the history on retry', async () => {
  const { user } = setup({
    configure: (fake) => {
      fake.stubs.messages.list
        .mockRejectedValueOnce(new EkozError({ code: 'room.permission_denied', status: 403 }))
        .mockResolvedValue({ items: [wireMessage(9)], lastSeq: '9', hasMore: false } as never);
    },
  });

  expect(await screen.findByText('The messages could not be loaded.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByText('message 9')).toBeInTheDocument();
});

it('shows the same error state on a 404', async () => {
  setup({
    configure: (fake) => {
      fake.stubs.messages.list.mockRejectedValue(
        new EkozError({ code: 'room.not_found', status: 404 }),
      );
    },
  });

  expect(await screen.findByText('The messages could not be loaded.')).toBeInTheDocument();
});

// --- live sync -------------------------------------------------------------

it('inserts a live message from the stream', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(fake, 'room_event', created(3));

  expect(await screen.findByText('live 3')).toBeInTheDocument();
});

it('ignores events of other rooms', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(fake, 'room_event', {
    ...created(3),
    roomId: 'other',
    event: { ...created(3).event, roomId: 'other' },
  });

  expect(screen.queryByText('live 3')).toBeNull();
});

it('does not duplicate a message the stream delivers twice', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(fake, 'room_event', created(3));
  await emit(fake, 'room_event', created(3));

  expect(await screen.findAllByText('live 3')).toHaveLength(1);
});

it('refetches an edited message and shows its new body', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  fake.stubs.messages.get.mockResolvedValue(
    wireMessage(2, { body: 'edited body', editedAt: '2026-01-02T00:00:00.000Z' }) as never,
  );

  await emit(fake, 'room_event', {
    roomId: 'r1',
    feedSeq: '3',
    event: {
      type: 'message_edited',
      roomId: 'r1',
      seq: '3',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm2', editedAt: '2026-01-02T00:00:00.000Z' },
    },
  });

  expect(await screen.findByText('edited body')).toBeInTheDocument();
  expect(fake.stubs.messages.get).toHaveBeenCalledWith('r1', 'm2');
  expect(screen.queryByText('message 2')).toBeNull();
});

it('turns a deleted message into a tombstone', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(fake, 'room_event', {
    roomId: 'r1',
    feedSeq: '3',
    event: {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '3',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm2', messageSeq: '2', reason: 'user' },
    },
  });

  expect(await screen.findByText('Message deleted')).toBeInTheDocument();
  expect(screen.queryByText('message 2')).toBeNull();
  expect(screen.getByText('message 1')).toBeInTheDocument();
});

it('buffers events that arrive while the first page is loading', async () => {
  let release: (page: unknown) => void = () => {};
  const { fake } = setup({
    configure: (f) => {
      f.stubs.messages.list.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }) as never,
      );
    },
  });
  await waitFor(() => expect(fake.streamControl.listenerCount('room_event')).toBeGreaterThan(0));

  // 3 arrives (buffered); 2 is already part of the page that is about to load.
  await emit(fake, 'room_event', created(3));
  expect(screen.queryByText('live 3')).toBeNull();
  await act(async () => {
    release({ items: [wireMessage(1), wireMessage(2)], lastSeq: '2', hasMore: false });
  });

  expect(await screen.findByText('live 3')).toBeInTheDocument();
  expect(screen.getByText('message 2')).toBeInTheDocument();
});

// --- reconnection ----------------------------------------------------------

it('catches up through /sync after a reconnection', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  fake.stubs.sync.get.mockResolvedValue({
    events: [created(3).event, created(4).event],
    lastSeq: '4',
  } as never);

  await emit(fake, 'reconnected');

  expect(await screen.findByText('live 4')).toBeInTheDocument();
  expect(screen.getByText('live 3')).toBeInTheDocument();
  expect(fake.stubs.sync.get).toHaveBeenCalledWith({ room: 'r1', since: '2' });
});

it('follows /sync pages until the head is reached', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  fake.stubs.sync.get
    .mockResolvedValueOnce({ events: [created(3).event], lastSeq: '4' } as never)
    .mockResolvedValueOnce({ events: [created(4).event], lastSeq: '4' } as never);

  await emit(fake, 'reconnected');

  expect(await screen.findByText('live 4')).toBeInTheDocument();
  expect(fake.stubs.sync.get).toHaveBeenNthCalledWith(2, { room: 'r1', since: '3' });
  expect(fake.stubs.sync.get).toHaveBeenCalledTimes(2);
});

it('is a no-op when the replayed feed already delivered the events', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  await emit(fake, 'room_event', created(3));
  await screen.findByText('live 3');
  fake.stubs.sync.get.mockResolvedValue({ events: [created(3).event], lastSeq: '3' } as never);

  await emit(fake, 'reconnected');

  await waitFor(() => expect(fake.stubs.sync.get).toHaveBeenCalled());
  expect(screen.getAllByText('live 3')).toHaveLength(1);
});

it('reloads the first page when the gap is larger than the sync pages', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  let seq = 2;
  fake.stubs.sync.get.mockImplementation(async () => {
    seq += 1;
    return { events: [created(seq).event], lastSeq: '999' } as never;
  });
  fake.stubs.messages.list.mockResolvedValue({
    items: [wireMessage(998), wireMessage(999)],
    lastSeq: '999',
    hasMore: true,
  } as never);

  await emit(fake, 'reconnected');

  expect(await screen.findByText('message 999')).toBeInTheDocument();
  expect(fake.stubs.sync.get).toHaveBeenCalledTimes(5);
  expect(screen.queryByText('message 1')).toBeNull();
});

it('reloads the first page when catch-up fails', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  fake.stubs.sync.get.mockRejectedValue(new NetworkError({ code: 'network_error', status: 0 }));
  fake.stubs.messages.list.mockResolvedValue({
    items: [wireMessage(5)],
    lastSeq: '5',
    hasMore: false,
  } as never);

  await emit(fake, 'reconnected');

  expect(await screen.findByText('message 5')).toBeInTheDocument();
});

// --- active room and lifecycle --------------------------------------------

it('marks the room active, clears its unseen dot, and releases it on unmount', async () => {
  markUnseen('r1');
  const { unmount } = setup();
  await screen.findByText('message 2');

  expect(getActiveRoom()).toBe('r1');

  unmount();
  expect(getActiveRoom()).toBeNull();
});

it('removes the timeline from the cache on unmount and unsubscribes from the stream', async () => {
  const { unmount, queryClient, fake } = setup();
  await screen.findByText('message 2');
  expect(queryClient.getQueryData(['chat', 'timeline', 'r1'])).toBeDefined();

  unmount();

  expect(queryClient.getQueryData(['chat', 'timeline', 'r1'])).toBeUndefined();
  expect(fake.streamControl.listenerCount('room_event')).toBe(0);
  expect(fake.streamControl.listenerCount('reconnected')).toBe(0);
});

// --- connection banner -----------------------------------------------------

it('shows the connection banner while the stream is not open', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  expect(screen.getByRole('status')).toHaveTextContent('Offline');

  await act(async () => fake.streamControl.setStatus('reconnecting'));
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...');

  await act(async () => fake.streamControl.setStatus('open'));
  expect(screen.queryByRole('status')).toBeNull();
});

// --- composer --------------------------------------------------------------

const composer = () => screen.getByRole('textbox', { name: 'Message' });

it('sends a message optimistically and reconciles it with the confirmed one', async () => {
  let confirm: (message: unknown) => void = () => {};
  const { fake, user } = setup({
    configure: (f) => {
      f.stubs.messages.send.mockImplementation(
        () =>
          new Promise((resolve) => {
            confirm = resolve;
          }) as never,
      );
    },
  });
  await screen.findByText('message 2');

  await user.type(composer(), 'hello there{Enter}');

  expect(await screen.findByText('hello there')).toBeInTheDocument();
  expect(screen.getByText('Sending')).toBeInTheDocument();
  expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', { body: 'hello there' });
  expect(composer()).toHaveTextContent('');
  expect(composer().textContent).toBe('');

  await act(async () => confirm(wireMessage(3, { body: 'hello there', authorId: 'u1' })));

  await waitFor(() => expect(screen.queryByText('Sending')).toBeNull());
  expect(screen.getAllByText('hello there')).toHaveLength(1);
});

it('does not duplicate the message when the stream delivers it before the response', async () => {
  let confirm: (message: unknown) => void = () => {};
  const { fake, user } = setup({
    configure: (f) => {
      f.stubs.messages.send.mockImplementation(
        () =>
          new Promise((resolve) => {
            confirm = resolve;
          }) as never,
      );
    },
  });
  await screen.findByText('message 2');
  await user.type(composer(), 'echo{Enter}');
  await screen.findByText('Sending');

  await emit(
    fake,
    'room_event',
    created(3, { content: { messageId: 'm3', body: 'echo', replyToId: null, mentions: [] } }),
  );
  await act(async () => confirm(wireMessage(3, { body: 'echo' })));

  await waitFor(() => expect(screen.queryByText('Sending')).toBeNull());
  expect(screen.getAllByText('echo')).toHaveLength(1);
});

it('sends nothing for a blank input', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');

  await user.type(composer(), '   {Enter}');

  expect(fake.stubs.messages.send).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

it('inserts a newline on Shift+Enter instead of sending', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');

  await user.type(composer(), 'line one{Shift>}{Enter}{/Shift}line two');

  expect(fake.stubs.messages.send).not.toHaveBeenCalled();
  expect(composer()).toHaveTextContent('line oneline two');
  expect(composer().querySelector('br')).not.toBeNull();
});

it('sends with the button, and sends no mentions for a typed @text', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');

  await user.type(composer(), '@bob hi');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', { body: '@bob hi' });
});

const failures: [string, unknown, string][] = [
  [
    'room.read_only',
    new EkozError({ code: 'room.read_only', status: 422 }),
    'This room is read-only.',
  ],
  [
    'room.permission_denied',
    new EkozError({ code: 'room.permission_denied', status: 403 }),
    'You do not have permission to write in this room.',
  ],
  [
    'message.body_too_long',
    new EkozError({ code: 'message.body_too_long', status: 422 }),
    'This message is too long.',
  ],
  [
    'message.body_invalid',
    new EkozError({ code: 'message.body_invalid', status: 422 }),
    'This message is not valid.',
  ],
  [
    'network',
    new NetworkError({ code: 'network_error', status: 0 }),
    'The server could not be reached.',
  ],
  [
    'message.mention_not_member',
    new EkozError({ code: 'message.mention_not_member', status: 422 }),
    'A mention is no longer valid. Remove it and try again.',
  ],
  [
    'message.mention_invalid',
    new EkozError({ code: 'message.mention_invalid', status: 422 }),
    'A mention is no longer valid. Remove it and try again.',
  ],
  ['other', new Error('boom'), 'The message could not be sent.'],
];

it.each(failures)('marks the message failed on %s and retries it', async (_name, error, text) => {
  const { fake, user } = setup();
  await screen.findByText('message 2');
  fake.stubs.messages.send.mockRejectedValueOnce(error as never);

  await user.type(composer(), 'try me{Enter}');

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Not sent');
  expect(alert).toHaveTextContent(text);

  fake.stubs.messages.send.mockResolvedValueOnce(wireMessage(3, { body: 'try me' }) as never);
  await user.click(within(alert).getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(fake.stubs.messages.send).toHaveBeenCalledTimes(2);
  expect(fake.stubs.messages.send).toHaveBeenLastCalledWith('r1', { body: 'try me' });
  expect(screen.getAllByText('try me')).toHaveLength(1);
});

it('keeps the message failed when the retry fails too', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');
  fake.stubs.messages.send.mockRejectedValue(
    new EkozError({ code: 'room.read_only', status: 422 }),
  );

  await user.type(composer(), 'nope{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(fake.stubs.messages.send).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('alert')).toHaveTextContent('Not sent');
});

// --- read-only and disabled states -----------------------------------------

it('enables the composer for a member who can post', async () => {
  setup();
  await screen.findByText('message 2');

  expect(composer()).toHaveAttribute('contenteditable', 'true');
});

it.each([
  ['invited', 'invited', CAN_POST, room, 'Join the room to write.'],
  ['joinable', 'joinable', CAN_POST, room, 'Join the room to write.'],
  [
    'read-only room',
    'member',
    CAN_POST,
    { id: 'r1', type: 'channel', readOnly: true },
    'This room is read-only.',
  ],
  [
    'missing permission',
    'member',
    ['room.read'],
    room,
    'You do not have permission to write in this room.',
  ],
] as const)(
  'disables the composer with an explanation: %s',
  async (_name, membership, capabilities, roomProp, text) => {
    setup({ membership, capabilities: [...capabilities], room: roomProp });
    await screen.findByText('message 2');

    expect(composer()).toHaveAttribute('contenteditable', 'false');
    expect(composer()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  },
);

it('lets a caller with room.edit_any post in a read-only room', async () => {
  setup({
    room: { id: 'r1', type: 'channel', readOnly: true },
    capabilities: [...CAN_POST, 'room.edit_any'],
  });
  await screen.findByText('message 2');

  expect(composer()).toHaveAttribute('contenteditable', 'true');
});

// --- mentions ---------------------------------------------------------------

const ME = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const itemOf = (text: string) => screen.getByText(text).closest('li') as HTMLElement;

it('highlights the messages the server says concern the caller', async () => {
  setup({
    items: [
      wireMessage(1, { mentionsMe: 'direct' }),
      wireMessage(2, { mentionsMe: 'collective' }),
      wireMessage(3),
    ],
    lastSeq: '3',
  });
  await screen.findByText('message 1');

  expect(itemOf('message 1')).toHaveAttribute('data-mentions-me', 'direct');
  expect(itemOf('message 2')).toHaveAttribute('data-mentions-me', 'collective');
  expect(itemOf('message 3')).not.toHaveAttribute('data-mentions-me');
});

it('derives a direct highlight for a live message that names the caller', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(
    fake,
    'room_event',
    created(3, {
      content: {
        messageId: 'm3',
        body: 'live hi @me',
        replyToId: null,
        mentions: [{ type: 'user', target: ME, token: '@me' }],
      },
    }),
  );

  expect(await screen.findByText('live hi')).toBeInTheDocument();
  expect(itemOf('live hi')).toHaveAttribute('data-mentions-me', 'direct');
});

it('derives a collective highlight for the caller role and group, but not for others', async () => {
  const { fake } = setup({
    members: [member('u1', 'Alice'), { ...member(ME, 'Jane'), role: 'moderator' }],
    configure: (f) => {
      f.stubs.groups.list.mockResolvedValue({
        items: [
          {
            id: 'g1',
            nodeId: 'r1',
            name: 'design',
            memberCount: 1,
            inherited: false,
            isMember: true,
          },
          {
            id: 'g2',
            nodeId: 'r1',
            name: 'ops',
            memberCount: 1,
            inherited: false,
            isMember: false,
          },
        ],
      } as never);
    },
  });
  await screen.findByText('message 2');
  await waitFor(() => expect(fake.stubs.groups.list).toHaveBeenCalled());
  await screen.findAllByText('Jane').catch(() => {});

  const live = (seq: number, mentions: unknown[]) =>
    created(seq, {
      content: { messageId: `m${seq}`, body: `live ${seq}`, replyToId: null, mentions },
    });
  await emit(
    fake,
    'room_event',
    live(3, [{ type: 'role', target: 'moderator', token: '@moderator' }]),
  );
  await emit(fake, 'room_event', live(4, [{ type: 'role', target: 'reader', token: '@reader' }]));
  await emit(fake, 'room_event', live(5, [{ type: 'group', target: 'g1', token: '@design' }]));
  await emit(fake, 'room_event', live(6, [{ type: 'group', target: 'g2', token: '@ops' }]));

  await screen.findByText('live 6');
  expect(itemOf('live 3')).toHaveAttribute('data-mentions-me', 'collective');
  expect(itemOf('live 4')).not.toHaveAttribute('data-mentions-me');
  expect(itemOf('live 5')).toHaveAttribute('data-mentions-me', 'collective');
  expect(itemOf('live 6')).not.toHaveAttribute('data-mentions-me');
});

it('never highlights the caller own live message', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  await emit(
    fake,
    'room_event',
    created(3, {
      senderId: ME,
      content: {
        messageId: 'm3',
        body: 'live self',
        replyToId: null,
        mentions: [{ type: 'all', target: null, token: '@all' }],
      },
    }),
  );

  expect(await screen.findByText('live self')).toBeInTheDocument();
  expect(itemOf('live self')).not.toHaveAttribute('data-mentions-me');
});

it('renders the chips of a message body', async () => {
  setup({
    items: [
      wireMessage(1, {
        body: 'ping @u1/example.test and @all',
        mentions: [
          { type: 'user', target: 'u1', token: '@u1/example.test' },
          { type: 'all', target: null, token: '@all' },
        ],
      }),
    ],
    lastSeq: '1',
  });

  expect(
    await screen.findByRole('button', { name: 'Mention of Alice, open profile' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Mention of everyone in the room' })).toBeInTheDocument();
});

it('sends the mentioned targets and keeps them when a failed send is retried', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');
  fake.stubs.messages.send.mockRejectedValueOnce(
    new EkozError({ code: 'message.mention_invalid', status: 422 }) as never,
  );

  await user.type(composer(), '@bo');
  await screen.findByRole('listbox');
  await user.keyboard('{Enter}');
  await user.keyboard('hi{Enter}');

  await screen.findByRole('alert');
  expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', {
    body: '@u2/example.test hi',
    mentions: [{ type: 'user', userId: 'u2' }],
  });
  // The pending message shows the chip while it is not delivered.
  expect(screen.getByRole('button', { name: 'Mention of Bob, open profile' })).toBeInTheDocument();

  fake.stubs.messages.send.mockResolvedValueOnce(wireMessage(3) as never);
  await user.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(fake.stubs.messages.send).toHaveBeenCalledTimes(2));
  expect(fake.stubs.messages.send).toHaveBeenLastCalledWith('r1', {
    body: '@u2/example.test hi',
    mentions: [{ type: 'user', userId: 'u2' }],
  });
});

it('sends collective targets as their wire inputs', async () => {
  const { fake, user } = setup();
  await screen.findByText('message 2');

  await user.type(composer(), '@every');
  await screen.findByRole('listbox');
  await user.keyboard('{Enter}');
  await user.type(composer(), '@moder');
  await user.keyboard('{Enter}');
  await user.keyboard('x{Enter}');

  expect(fake.stubs.messages.send).toHaveBeenCalledWith('r1', {
    body: '@all @moderator x',
    mentions: [{ type: 'all' }, { type: 'role', role: 'moderator' }],
  });
});

it('offers no collective entries in a direct message', async () => {
  const { user } = setup({ room: { id: 'r1', type: 'dm', readOnly: false } });
  await screen.findByText('message 2');

  await user.type(composer(), '@');
  await screen.findByRole('listbox');

  expect(screen.getByText('People')).toBeInTheDocument();
  expect(screen.queryByText('Roles')).toBeNull();
  expect(screen.queryByText('Everyone')).toBeNull();
});

// --- jump to a message and detached timeline ---------------------------------

/** A room of 10 messages whose window around `at` ends at 12, with 14 as the newest. */
function detachedSetup(options: SetupOptions = {}) {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const result = setup({
    at: '11',
    configure: (fake) => {
      fake.stubs.messages.list.mockImplementation((async (
        _room: string,
        params?: { around?: string; after?: string },
      ) => {
        if (params?.around)
          return {
            items: [wireMessage(10), wireMessage(11), wireMessage(12)],
            lastSeq: '14',
            hasMore: false,
            hasMoreNewer: true,
          };
        if (params?.after === '12')
          return {
            items: [wireMessage(13), wireMessage(14)],
            lastSeq: '14',
            hasMore: false,
            hasMoreNewer: false,
          };
        return { items: [], lastSeq: '14', hasMore: false, hasMoreNewer: false };
      }) as never);
    },
    ...options,
  });
  return { ...result, scrollIntoView };
}

const scrollList = () => screen.getByRole('list').parentElement as HTMLElement;

it('opens the room around the message it was asked at, scrolls to it and outlines it', async () => {
  const { fake, scrollIntoView } = detachedSetup();

  expect(await screen.findByText('message 11')).toBeInTheDocument();

  expect(fake.stubs.messages.list).toHaveBeenCalledWith('r1', { around: '11' });
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }));
  expect(itemOf('message 11')).toHaveAttribute('data-jump-target');
  expect(itemOf('message 10')).not.toHaveAttribute('data-jump-target');
  expect(toast.info).not.toHaveBeenCalled();
});

it('shows an info toast and stays at the loaded window when the target is not there', async () => {
  const { scrollIntoView } = detachedSetup({ at: '5' });

  await screen.findByText('message 11');

  expect(toast.info).toHaveBeenCalledWith('This message is no longer available.');
  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(document.querySelector('[data-jump-target]')).toBeNull();
});

it('does not open at a message without at', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');

  expect(fake.stubs.messages.list).toHaveBeenCalledWith('r1');
  expect(toast.info).not.toHaveBeenCalled();
});

it('loads newer pages when scrolled to the bottom until it reaches the newest message', async () => {
  const { fake } = detachedSetup();
  await screen.findByText('message 12');
  expect(screen.getByRole('button', { name: 'Load newer messages' })).toBeInTheDocument();

  fireEvent.scroll(scrollList());

  expect(await screen.findByText('message 14')).toBeInTheDocument();
  expect(fake.stubs.messages.list).toHaveBeenLastCalledWith('r1', { after: '12' });
  const order = within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('data-message-id'));
  expect(order).toEqual(['m10', 'm11', 'm12', 'm13', 'm14']);
  expect(screen.queryByRole('button', { name: 'Load newer messages' })).toBeNull();
});

it('loads newer messages from the button, and reports a failure', async () => {
  const { fake, user } = detachedSetup();
  await screen.findByText('message 12');
  const list = fake.stubs.messages.list.getMockImplementation();
  fake.stubs.messages.list.mockRejectedValueOnce(new Error('boom'));

  await user.click(screen.getByRole('button', { name: 'Load newer messages' }));
  expect(
    await screen.findByRole('button', { name: /Could not load newer messages/ }),
  ).toBeInTheDocument();

  fake.stubs.messages.list.mockImplementation(list as never);
  await user.click(screen.getByRole('button', { name: /Could not load newer messages/ }));
  expect(await screen.findByText('message 14')).toBeInTheDocument();
});

it('leaves live messages out while detached and inserts them once caught up with the head', async () => {
  const { fake } = detachedSetup();
  await screen.findByText('message 12');

  await emit(fake, 'room_event', created(15));
  expect(screen.queryByText('live 15')).toBeNull();

  fireEvent.scroll(scrollList());
  await screen.findByText('message 14');
  await emit(fake, 'room_event', created(16));

  expect(await screen.findByText('live 16')).toBeInTheDocument();
});

it('still applies a deletion to a loaded message while detached', async () => {
  const { fake } = detachedSetup();
  await screen.findByText('message 12');

  await emit(fake, 'room_event', {
    roomId: 'r1',
    feedSeq: '20',
    event: {
      type: 'message_deleted',
      roomId: 'r1',
      seq: '20',
      senderId: 'u1',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { messageId: 'm12', messageSeq: '12', reason: 'user' },
    },
  });

  expect(await screen.findByText('Message deleted')).toBeInTheDocument();
});

it('offers to jump to the latest messages while detached, and only then', async () => {
  const onJumpToLatest = vi.fn();
  const { user } = detachedSetup({ onJumpToLatest });
  await screen.findByText('message 12');

  expect(screen.getByText('You are viewing older messages.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Jump to latest' }));
  expect(onJumpToLatest).toHaveBeenCalledTimes(1);

  fireEvent.scroll(scrollList());
  await screen.findByText('message 14');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull());
});

it('shows no jump button on a room opened at the newest message', async () => {
  setup({ onJumpToLatest: vi.fn() });
  await screen.findByText('message 2');

  expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
});
