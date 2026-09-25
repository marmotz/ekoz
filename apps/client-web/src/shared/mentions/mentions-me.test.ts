import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { roomGroupsKey } from '@/shared/groups/room-groups';
import { roomMembersKey } from '@/shared/members/room-members';
import {
  deriveMentionsMe,
  type MentionViewer,
  parseMentionsMe,
  viewerFromCache,
} from '@/shared/mentions/mentions-me';
import { ME_QUERY_KEY } from '@/shared/sdk/use-me';

const viewer: MentionViewer = { userId: 'me', role: 'moderator', groupIds: new Set(['g1']) };
const user = (target: string) => ({ type: 'user' as const, target, token: `@${target}` });
const all = { type: 'all' as const, target: null, token: '@all' };
const role = (target: string) => ({ type: 'role' as const, target, token: `@${target}` });
const group = (target: string) => ({ type: 'group' as const, target, token: `@${target}` });

it('is direct when the viewer is named', () => {
  expect(deriveMentionsMe([user('me')], 'u2', viewer)).toBe('direct');
});

it('is direct even when a collective target is also there', () => {
  expect(deriveMentionsMe([all, user('me')], 'u2', viewer)).toBe('direct');
});

it('is collective for @all', () => {
  expect(deriveMentionsMe([all], 'u2', viewer)).toBe('collective');
});

it('is collective for the viewer role only', () => {
  expect(deriveMentionsMe([role('moderator')], 'u2', viewer)).toBe('collective');
  expect(deriveMentionsMe([role('reader')], 'u2', viewer)).toBeNull();
});

it('is collective for a group the viewer belongs to only', () => {
  expect(deriveMentionsMe([group('g1')], 'u2', viewer)).toBe('collective');
  expect(deriveMentionsMe([group('g2')], 'u2', viewer)).toBeNull();
});

it('is null when nobody relevant is mentioned', () => {
  expect(deriveMentionsMe([user('u3')], 'u2', viewer)).toBeNull();
  expect(deriveMentionsMe([], 'u2', viewer)).toBeNull();
});

it('never concerns the author', () => {
  expect(deriveMentionsMe([user('me'), all], 'me', viewer)).toBeNull();
});

it('is null while the viewer is unknown', () => {
  expect(deriveMentionsMe([all], 'u2', null)).toBeNull();
});

it('ignores unresolved roles and groups by default, and can match them', () => {
  const unknown: MentionViewer = { userId: 'me' };

  expect(deriveMentionsMe([role('moderator'), group('g1')], 'u2', unknown)).toBeNull();
  expect(deriveMentionsMe([role('moderator')], 'u2', unknown, { unresolved: 'match' })).toBe(
    'collective',
  );
  expect(deriveMentionsMe([group('g1')], 'u2', unknown, { unresolved: 'match' })).toBe(
    'collective',
  );
});

it('parses the server value', () => {
  expect(parseMentionsMe('direct')).toBe('direct');
  expect(parseMentionsMe('collective')).toBe('collective');
  expect(parseMentionsMe('other')).toBeNull();
  expect(parseMentionsMe(null)).toBeNull();
  expect(parseMentionsMe(undefined)).toBeNull();
});

it('reads the viewer from the query cache', () => {
  const queryClient = new QueryClient();
  expect(viewerFromCache(queryClient, 'r1')).toBeNull();

  queryClient.setQueryData(ME_QUERY_KEY, { id: 'me' });
  expect(viewerFromCache(queryClient, 'r1')).toEqual({
    userId: 'me',
    role: undefined,
    groupIds: undefined,
  });

  queryClient.setQueryData(roomMembersKey('r1'), {
    members: [{ role: 'reader', user: { id: 'me' } }],
    truncated: false,
  });
  queryClient.setQueryData(roomGroupsKey('r1'), {
    items: [
      { id: 'g1', isMember: true },
      { id: 'g2', isMember: false },
    ],
  });
  const loaded = viewerFromCache(queryClient, 'r1');
  expect(loaded?.role).toBe('reader');
  expect([...(loaded?.groupIds ?? [])]).toEqual(['g1']);
});
