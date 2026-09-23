import { EkozError, NetworkError } from '@ekozhq/sdk';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { RoomChat } from '@/features/chat/components/room-chat';
import { getActiveRoom, markUnseen, resetUnseenRooms } from '@/shared/realtime/unseen-rooms';
import { type Configure, type Fake, renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const room = { id: 'r1', readOnly: false };
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
  room?: { id: string; readOnly: boolean };
  configure?: Configure;
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
}: SetupOptions = {}) {
  return renderSignedIn(
    <RoomChat room={roomProp} capabilities={capabilities} membership={membership} />,
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

it('shows the author labels for deleted and unknown accounts and refetches the members once', async () => {
  const { fake } = setup({
    items: [
      wireMessage(1, { authorId: null }),
      wireMessage(2, { authorId: 'u3' }),
      wireMessage(3, { authorId: 'gone' }),
    ],
    lastSeq: '3',
    members: [member('u3', null), member('u1', 'Alice')],
  });

  await screen.findByText('message 3');

  await waitFor(() => expect(screen.getAllByText('Deleted account')).toHaveLength(2));
  expect(screen.getByText('Unknown user')).toBeInTheDocument();
  await waitFor(() => expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(2);
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

it('refetches the members when someone joins', async () => {
  const { fake } = setup();
  await screen.findByText('message 2');
  await waitFor(() => expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(1));

  await emit(fake, 'room_event', {
    roomId: 'r1',
    feedSeq: '3',
    event: {
      type: 'member_joined',
      roomId: 'r1',
      seq: '3',
      senderId: 'u9',
      createdAt: '2026-01-02T00:00:00.000Z',
      content: { userId: 'u9' },
    },
  });

  await waitFor(() => expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(2));
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
  expect(composer()).toHaveValue('');

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
  expect(composer()).toHaveValue('line one\nline two');
});

it('sends with the button and never sends mentions', async () => {
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

  expect(composer()).toBeEnabled();
});

it.each([
  ['invited', 'invited', CAN_POST, room, 'Join the room to write.'],
  ['joinable', 'joinable', CAN_POST, room, 'Join the room to write.'],
  ['read-only room', 'member', CAN_POST, { id: 'r1', readOnly: true }, 'This room is read-only.'],
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

    expect(composer()).toBeDisabled();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  },
);

it('lets a caller with room.edit_any post in a read-only room', async () => {
  setup({ room: { id: 'r1', readOnly: true }, capabilities: [...CAN_POST, 'room.edit_any'] });
  await screen.findByText('message 2');

  expect(composer()).toBeEnabled();
});
