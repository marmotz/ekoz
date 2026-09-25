import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { myMentionsKey, unreadMentionsKey } from '@/shared/mentions/unread-mentions';
import {
  UNREAD_MENTIONS_COALESCE_MS,
  useUnreadMentionsLive,
} from '@/shared/mentions/use-unread-mentions-live';
import { resetUnseenRooms, setActiveRoom } from '@/shared/realtime/unseen-rooms';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk, defaultMe } from '../../../test/sdk-mock';

const ME = defaultMe.id;

function setup() {
  const fake = createFakeSdk();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, { ...defaultMe });
  queryClient.setQueryData(unreadMentionsKey, {
    items: [{ roomId: 'r1', direct: 1, collective: 0 }],
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  renderHook(() => useUnreadMentionsLive(), { wrapper });

  const emit = (roomId: string, event: Record<string, unknown>) =>
    act(() =>
      fake.streamControl.emit('room_event', {
        roomId,
        feedSeq: '1',
        event: {
          roomId,
          seq: '5',
          senderId: 'u2',
          createdAt: '2026-01-01T00:00:00.000Z',
          ...event,
        },
      }),
    );
  const created = (roomId: string, mentions: unknown[], senderId = 'u2') =>
    emit(roomId, {
      type: 'message_created',
      senderId,
      content: { messageId: 'm', body: 'x', replyToId: null, mentions },
    });
  const refreshes = () =>
    invalidate.mock.calls.filter(([filters]) => filters?.queryKey === unreadMentionsKey).length;

  return { fake, queryClient, invalidate, emit, created, refreshes };
}

beforeEach(() => {
  resetUnseenRooms();
});

afterEach(() => {
  vi.useRealTimers();
  resetUnseenRooms();
});

const direct = { type: 'user', target: ME, token: '@me' };
const everyone = { type: 'all', target: null, token: '@all' };

describe('useUnreadMentionsLive', () => {
  it('refreshes the counters and My mentions for a message that names the caller', async () => {
    const { created, invalidate } = setup();

    await created('r9', [direct]);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: unreadMentionsKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myMentionsKey });
  });

  it('refreshes for a collective mention', async () => {
    const { created, refreshes } = setup();

    await created('r9', [everyone]);

    expect(refreshes()).toBe(1);
  });

  it('ignores a message in the room that is open', async () => {
    const { created, refreshes } = setup();
    setActiveRoom('r9');

    await created('r9', [direct]);

    expect(refreshes()).toBe(0);
  });

  it('ignores messages that do not concern the caller, and the caller own messages', async () => {
    const { created, refreshes } = setup();

    await created('r9', []);
    await created('r9', [{ type: 'user', target: 'someone-else', token: '@x' }]);
    await created('r9', [direct, everyone], ME);

    expect(refreshes()).toBe(0);
  });

  it('treats a role or group of a room that was never opened as possibly concerning the caller', async () => {
    const { created, refreshes } = setup();

    await created('r9', [{ type: 'role', target: 'moderator', token: '@moderator' }]);

    expect(refreshes()).toBe(1);
  });

  it('uses the cached role and groups of a room that was opened', async () => {
    const { created, refreshes, queryClient } = setup();
    queryClient.setQueryData(['members', 'r9'], {
      members: [{ role: 'reader', user: { id: ME } }],
      truncated: false,
    });
    queryClient.setQueryData(['groups', 'r9'], { items: [{ id: 'g1', isMember: false }] });

    await created('r9', [
      { type: 'role', target: 'moderator', token: '@moderator' },
      { type: 'group', target: 'g1', token: '@design' },
    ]);
    expect(refreshes()).toBe(0);

    await created('r9', [{ type: 'role', target: 'reader', token: '@reader' }]);
    expect(refreshes()).toBe(1);
  });

  it('refreshes on the caller own receipt only', async () => {
    const { emit, refreshes } = setup();

    await emit('r1', {
      type: 'receipt_updated',
      senderId: 'u2',
      content: { userId: 'u2', seq: '5' },
    });
    expect(refreshes()).toBe(0);

    await emit('r1', { type: 'receipt_updated', senderId: ME, content: { userId: ME, seq: '5' } });
    expect(refreshes()).toBe(1);
  });

  it.each(['message_edited', 'message_deleted'])(
    'refreshes on %s in a room that has unread mentions',
    async (type) => {
      const { emit, refreshes } = setup();

      await emit('r1', { type, content: {} });

      expect(refreshes()).toBe(1);
    },
  );

  it('ignores an edit or deletion in a room without unread mentions', async () => {
    const { emit, refreshes } = setup();

    await emit('r2', { type: 'message_edited', content: {} });
    await emit('r2', { type: 'message_deleted', content: {} });

    expect(refreshes()).toBe(0);
  });

  it('ignores unrelated events', async () => {
    const { emit, refreshes } = setup();

    await emit('r1', { type: 'member_joined', content: {} });

    expect(refreshes()).toBe(0);
  });

  it('coalesces refreshes to one per second', async () => {
    vi.useFakeTimers();
    const { created, refreshes } = setup();

    await created('r9', [direct]);
    expect(refreshes()).toBe(1);

    await created('r9', [direct]);
    await created('r9', [direct]);
    expect(refreshes()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_MENTIONS_COALESCE_MS);
    });
    expect(refreshes()).toBe(2);

    // Nothing else was pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_MENTIONS_COALESCE_MS * 2);
    });
    expect(refreshes()).toBe(2);

    // A later event, outside the window, refreshes at once.
    await created('r9', [direct]);
    expect(refreshes()).toBe(3);
  });
});
