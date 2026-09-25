import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import {
  myMentionsKey,
  totalUnreadMentions,
  unreadMentionsKey,
  unreadOfRoom,
  useRoomUnreadMentions,
  useUnreadMentions,
} from '@/shared/mentions/unread-mentions';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../test/sdk-mock';

const data = {
  items: [
    { roomId: 'r1', direct: 2, collective: 1 },
    { roomId: 'r2', direct: 0, collective: 4 },
  ],
};

it('builds the query keys', () => {
  expect(unreadMentionsKey).toEqual(['mentions', 'unread']);
  expect(myMentionsKey).toEqual(['mentions', 'list']);
});

it('reads the counters of a room, zero when it has none', () => {
  expect(unreadOfRoom(data, 'r1')).toEqual({ direct: 2, collective: 1 });
  expect(unreadOfRoom(data, 'r2')).toEqual({ direct: 0, collective: 4 });
  expect(unreadOfRoom(data, 'other')).toEqual({ direct: 0, collective: 0 });
  expect(unreadOfRoom(undefined, 'r1')).toEqual({ direct: 0, collective: 0 });
});

it('totals every room', () => {
  expect(totalUnreadMentions(data)).toBe(7);
  expect(totalUnreadMentions({ items: [] })).toBe(0);
  expect(totalUnreadMentions(undefined)).toBe(0);
});

it('loads the counters through the SDK', async () => {
  const fake = createFakeSdk();
  fake.stubs.mentions.unread.mockResolvedValue(data as never);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );

  const all = renderHook(() => useUnreadMentions(), { wrapper });
  const room = renderHook(() => useRoomUnreadMentions('r2'), { wrapper });

  await waitFor(() => expect(all.result.current.data).toEqual(data));
  await waitFor(() => expect(room.result.current).toEqual({ direct: 0, collective: 4 }));
});
