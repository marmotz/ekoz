import { expect, it } from 'vitest';

import {
  dedupeMentions,
  MENTION_ROLES,
  tokenFor,
  toMentionInputs,
} from '@/features/chat/lib/mention-node';

it('computes the token the server freezes', () => {
  expect(tokenFor({ type: 'user', identifier: 'alice/chat.test' })).toBe('@alice/chat.test');
  expect(tokenFor({ type: 'all' })).toBe('@all');
  expect(tokenFor({ type: 'role', name: 'moderator' })).toBe('@moderator');
  expect(tokenFor({ type: 'group', name: 'design' })).toBe('@design');
});

it('knows the five room roles', () => {
  expect(MENTION_ROLES).toEqual(['space_admin', 'room_admin', 'moderator', 'member', 'reader']);
});

it('maps resolved targets to the inputs the API takes', () => {
  expect(
    toMentionInputs([
      { type: 'user', target: 'u1', token: '@a/b' },
      { type: 'all', target: null, token: '@all' },
      { type: 'role', target: 'reader', token: '@reader' },
      { type: 'group', target: 'g1', token: '@design' },
      { type: 'user', target: null, token: '@deleted' },
    ]),
  ).toEqual([
    { type: 'user', userId: 'u1' },
    { type: 'all' },
    { type: 'role', role: 'reader' },
    { type: 'group', groupId: 'g1' },
  ]);
});

it('keeps one entry per target', () => {
  expect(
    dedupeMentions([
      { type: 'user', target: 'u1' },
      { type: 'user', target: 'u1' },
      { type: 'group', target: 'u1' },
      { type: 'all', target: null },
      { type: 'all', target: null },
    ]),
  ).toEqual([
    { type: 'user', target: 'u1' },
    { type: 'group', target: 'u1' },
    { type: 'all', target: null },
  ]);
});
