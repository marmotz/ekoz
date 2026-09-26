import { QueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationKeys } from '@/features/direct-messages/api/keys';
import { ConversationsLive } from '@/features/direct-messages/components/conversations-live';
import { resetActiveRooms, setActiveRoom } from '@/shared/realtime/active-room';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';
import { toast } from '@/shared/ui/sonner';
import { conversationItem } from '../../../../test/conversation-fixtures';
import { renderSignedIn } from '../../../../test/render-signed-in';
import { createClientMock, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('@/shared/ui/sonner', () => ({ toast: vi.fn() }));

beforeEach(() => {
  createClientMock.mockReset();
  vi.mocked(toast).mockClear();
  resetActiveRooms();
});

async function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationKeys.list(), { items: [conversationItem({ id: 'c1' })] });
  queryClient.setQueryData(ME_QUERY_KEY, { ...defaultMe });
  const rendered = renderSignedIn(<ConversationsLive />, { route: '/dms/c1', queryClient });
  const emit = (event: Record<string, unknown>) =>
    act(() =>
      rendered.fake.streamControl.emit('room_event', {
        roomId: 'c1',
        feedSeq: '1',
        event: { roomId: 'c1', seq: '5', createdAt: '2026-01-01T00:00:00.000Z', ...event },
      }),
    );

  await vi.waitFor(() =>
    expect(rendered.fake.streamControl.listenerCount('room_event')).toBeGreaterThan(0),
  );

  return { ...rendered, emit };
}

describe('ConversationsLive', () => {
  it('goes home with a toast when the open conversation is deleted', async () => {
    const { emit, router } = await setup();
    setActiveRoom('c1');

    emit({ type: 'room_deleted', senderId: 'u2', content: {} });

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(toast).toHaveBeenCalledWith('This conversation was deleted.');
  });

  it('goes home with a toast when the caller is removed from the open conversation', async () => {
    const { emit, router, queryClient } = await setup();
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(['conversations', 'list'])).toBeDefined(),
    );
    setActiveRoom('c1');

    emit({ type: 'member_kicked', senderId: 'u2', content: { userId: defaultMe.id } });

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(toast).toHaveBeenCalledWith('You were removed from this conversation.');
  });

  it('stays put when another conversation is deleted', async () => {
    const { emit, router } = await setup();
    setActiveRoom('other');

    emit({ type: 'room_deleted', senderId: 'u2', content: {} });

    expect(toast).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/dms/c1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
