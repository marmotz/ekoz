import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { roomKeys } from '@/features/rooms/api/keys';
import { roomQueries } from '@/features/rooms/api/queries';
import { createFakeSdk } from '../../../../test/sdk-mock';

describe('roomKeys', () => {
  it('builds the keys of the technical design', () => {
    expect(roomKeys.list()).toEqual(['rooms', 'list']);
    expect(roomKeys.detail('r1')).toEqual(['rooms', 'detail', 'r1']);
    expect(roomKeys.preview('r1')).toEqual(['rooms', 'preview', 'r1']);
    expect(roomKeys.permissions('r1')).toEqual(['rooms', 'permissions', 'r1']);
    expect(roomKeys.directory('gen')).toEqual(['rooms', 'directory', 'gen']);
    expect(roomKeys.invitations()).toEqual(['rooms', 'invitations']);
    expect(roomKeys.joinRequests('r1')).toEqual(['rooms', 'join-requests', 'r1']);
  });
});

/** The page param `options` derives from the last loaded page. */
function nextPageParam<Page>(
  options: {
    getNextPageParam: (
      last: Page,
      all: Page[],
      lastParam: undefined,
      params: undefined[],
    ) => unknown;
  },
  pages: Page[],
) {
  const last = pages.at(-1);
  if (last === undefined) throw new Error('No page loaded');
  return options.getNextPageParam(last, pages, undefined, [undefined]);
}

describe('roomQueries', () => {
  it('leaves the list and the invitations on the default freshness: the stream keeps them live', () => {
    const { sdk } = createFakeSdk();

    for (const options of [roomQueries.list(sdk), roomQueries.invitations(sdk)]) {
      expect(options.staleTime).toBeUndefined();
      expect(options.refetchOnWindowFocus).toBeUndefined();
    }
  });

  it('is disabled without a client', async () => {
    const all = [
      roomQueries.list(null),
      roomQueries.invitations(null),
      roomQueries.detail(null, 'r1'),
      roomQueries.preview(null, 'r1'),
      roomQueries.permissions(null, 'r1'),
      roomQueries.directory(null, ''),
      roomQueries.joinRequests(null, 'r1'),
    ];

    for (const options of all) expect(options.enabled).toBe(false);
    await expect(new QueryClient().fetchQuery(roomQueries.list(null))).rejects.toThrow(
      'SDK not started',
    );
  });

  it('pages the directory on nextCursor, without an empty query', async () => {
    const { sdk, stubs } = createFakeSdk();
    stubs.directory.list
      .mockResolvedValueOnce({ items: [], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const queryClient = new QueryClient();
    const options = roomQueries.directory(sdk, '');

    const first = await queryClient.fetchInfiniteQuery(options);
    expect(nextPageParam(options, first.pages)).toBe('c2');
    expect(stubs.directory.list).toHaveBeenLastCalledWith({ query: undefined, cursor: undefined });

    await queryClient.fetchInfiniteQuery(roomQueries.directory(sdk, 'gen'));
    expect(stubs.directory.list).toHaveBeenCalledWith({ query: 'gen', cursor: undefined });
  });

  it('stops paging the join requests when the cursor runs out', async () => {
    const { sdk, stubs } = createFakeSdk();
    stubs.rooms.listJoinRequests.mockResolvedValue({ items: [], nextCursor: null });
    const options = roomQueries.joinRequests(sdk, 'r1');

    const data = await new QueryClient().fetchInfiniteQuery(options);

    expect(stubs.rooms.listJoinRequests).toHaveBeenCalledWith('r1', { cursor: undefined });
    expect(nextPageParam(options, data.pages)).toBeUndefined();
  });
});
