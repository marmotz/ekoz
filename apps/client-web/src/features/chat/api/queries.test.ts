import type { EkozClient } from '@ekozhq/sdk';
import { expect, it, vi } from 'vitest';

import { fetchFirstPage, fetchOlderPage } from '@/features/chat/api/queries';
import { chatKeys } from '@/features/chat/api/query-keys';

it('builds the query keys', () => {
  expect(chatKeys.timeline('r1')).toEqual(['chat', 'timeline', 'r1']);
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
