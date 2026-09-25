import type { Group, Member } from '@ekozhq/sdk';
import { expect, it } from 'vitest';

import {
  buildSuggestions,
  labelForMention,
  type SuggestionSources,
} from '@/features/chat/lib/mention-suggestions';

const member = (id: string, displayName: string | null, identifier: string | null): Member =>
  ({ role: 'member', user: { id, displayName, identifier, avatarUrl: null } }) as Member;
const group = (id: string, name: string): Group =>
  ({ id, name, nodeId: 'r1', memberCount: 2, inherited: false, isMember: false }) as Group;

const sources: SuggestionSources = {
  members: [
    member('u1', 'Alice Martin', 'amartin/chat.test'),
    member('u2', 'Bob', 'bob/chat.test'),
    member('u3', null, null),
  ],
  groups: [group('g1', 'design'), group('g2', 'ops')],
  allowCollective: true,
  roleLabel: (role) => `label-${role}`,
  allLabel: 'everyone',
};

const keys = (query: string, override: Partial<SuggestionSources> = {}) =>
  buildSuggestions(query, { ...sources, ...override }).map((item) => item.key);

it('lists every section for an empty query, people first, skipping people with no name', () => {
  expect(keys('')).toEqual([
    'user:u1',
    'user:u2',
    'group:g1',
    'group:g2',
    'role:space_admin',
    'role:room_admin',
    'role:moderator',
    'role:member',
    'role:reader',
    'all',
  ]);
});

it('filters case-insensitively on display name, identifier and name', () => {
  expect(keys('MARTIN')).toEqual(['user:u1']);
  expect(keys('bob/CHAT')).toEqual(['user:u2']);
  expect(keys('DES')).toEqual(['group:g1']);
  expect(keys('label-mod')).toEqual(['role:moderator']);
  expect(keys('EVERY')).toEqual(['all']);
  expect(keys('zzz')).toEqual([]);
});

it('builds the token a message will carry', () => {
  const [user, groupItem, role, all] = [
    ...buildSuggestions('amartin', sources),
    ...buildSuggestions('design', sources),
    ...buildSuggestions('moderator', sources),
    ...buildSuggestions('every', sources),
  ];

  expect(user?.mention).toEqual({
    type: 'user',
    target: 'u1',
    token: '@amartin/chat.test',
    label: 'Alice Martin',
  });
  expect(groupItem?.mention.token).toBe('@design');
  expect(role?.mention).toMatchObject({ type: 'role', target: 'moderator', token: '@moderator' });
  expect(all?.mention).toMatchObject({ type: 'all', target: null, token: '@all' });
});

it('leaves groups, roles and @all out where collective mentions are not allowed', () => {
  expect(keys('', { allowCollective: false })).toEqual(['user:u1', 'user:u2']);
});

it('caps the number of people per section', () => {
  const many = Array.from({ length: 20 }, (_, index) =>
    member(`u${index}`, `Person ${index}`, `p${index}/chat.test`),
  );

  expect(
    buildSuggestions('', { ...sources, members: many }).filter((i) => i.section === 'people'),
  ).toHaveLength(8);
});

it('labels a target for a chip, falling back to the token', () => {
  expect(labelForMention({ type: 'user', target: 'u1', token: '@x' }, sources)).toBe(
    'Alice Martin',
  );
  expect(labelForMention({ type: 'user', target: 'gone', token: '@gone/chat.test' }, sources)).toBe(
    'gone/chat.test',
  );
  expect(labelForMention({ type: 'group', target: 'g2', token: '@x' }, sources)).toBe('ops');
  expect(labelForMention({ type: 'group', target: 'gone', token: '@old' }, sources)).toBe('old');
  expect(labelForMention({ type: 'role', target: 'reader', token: '@reader' }, sources)).toBe(
    'label-reader',
  );
  expect(labelForMention({ type: 'all', target: null, token: '@all' }, sources)).toBe('everyone');
});
