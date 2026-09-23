import type { EkozClient } from '@ekozhq/sdk';
import { expect, it, vi } from 'vitest';

import {
  fetchFirstPage,
  fetchMembers,
  fetchOlderPage,
  MAX_MEMBER_PAGES,
} from '@/features/chat/api/queries';
import { chatKeys } from '@/features/chat/api/query-keys';

const member = (id: string) => ({
  role: 'member',
  joinedAt: '',
  user: { id, identifier: null, displayName: id, avatarUrl: null },
});

it('builds the query keys', () => {
  expect(chatKeys.timeline('r1')).toEqual(['chat', 'timeline', 'r1']);
  expect(chatKeys.members('r1')).toEqual(['chat', 'members', 'r1']);
});

it('loads the newest page as a timeline', async () => {
  const list = vi.fn(async () => ({ items: [], lastSeq: '4', hasMore: true }));
  const sdk = { messages: { list } } as unknown as EkozClient;

  const timeline = await fetchFirstPage(sdk, 'r1');

  expect(list).toHaveBeenCalledWith('r1');
  expect(timeline).toMatchObject({ lastSeq: '4', hasMoreOlder: true, messages: [], pending: [] });
});

it('loads an older page with the before cursor', async () => {
  const list = vi.fn(async () => ({ items: [], lastSeq: '4', hasMore: false }));
  const sdk = { messages: { list } } as unknown as EkozClient;

  await fetchOlderPage(sdk, 'r1', '10');

  expect(list).toHaveBeenCalledWith('r1', { before: '10' });
});

it('follows the members cursor until it is null', async () => {
  const members = vi
    .fn()
    .mockResolvedValueOnce({ items: [member('a')], nextCursor: 'c1' })
    .mockResolvedValueOnce({ items: [member('b')], nextCursor: null });
  const sdk = { rooms: { members } } as unknown as EkozClient;

  const result = await fetchMembers(sdk, 'r1');

  expect(result.map((m) => m.user.id)).toEqual(['a', 'b']);
  expect(members).toHaveBeenNthCalledWith(1, 'r1', undefined);
  expect(members).toHaveBeenNthCalledWith(2, 'r1', { cursor: 'c1' });
});

it('stops after the maximum number of member pages', async () => {
  const members = vi.fn(async () => ({ items: [member('a')], nextCursor: 'more' }));
  const sdk = { rooms: { members } } as unknown as EkozClient;

  const result = await fetchMembers(sdk, 'r1');

  expect(members).toHaveBeenCalledTimes(MAX_MEMBER_PAGES);
  expect(result).toHaveLength(MAX_MEMBER_PAGES);
});
