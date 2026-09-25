import type { EkozClient } from '@ekozhq/sdk';
import { expect, it, vi } from 'vitest';

import { fetchFirstPage, fetchNewerPage, fetchOlderPage } from '@/features/chat/api/queries';
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

it('loads the window around a message when opened at one, detached from the newest', async () => {
  const list = vi.fn(async () => ({ items: [], lastSeq: '90', hasMore: true, hasMoreNewer: true }));
  const sdk = { messages: { list } } as unknown as EkozClient;

  const timeline = await fetchFirstPage(sdk, 'r1', '42');

  expect(list).toHaveBeenCalledWith('r1', { around: '42' });
  expect(timeline).toMatchObject({ lastSeq: '90', hasMoreOlder: true, hasMoreNewer: true });
});

it('is attached to the newest message for a plain first page', async () => {
  const list = vi.fn(async () => ({ items: [], lastSeq: '4', hasMore: false }));
  const sdk = { messages: { list } } as unknown as EkozClient;

  expect((await fetchFirstPage(sdk, 'r1')).hasMoreNewer).toBe(false);
});

it('loads a newer page with the after cursor', async () => {
  const list = vi.fn(async () => ({ items: [], lastSeq: '4', hasMore: false }));
  const sdk = { messages: { list } } as unknown as EkozClient;

  await fetchNewerPage(sdk, 'r1', '10');

  expect(list).toHaveBeenCalledWith('r1', { after: '10' });
});
