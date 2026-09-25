import type { Member } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';

import { groupMembers } from '@/features/members/lib/group-members';

function member(
  id: string,
  displayName: string | null,
  role: Member['role'] = 'member',
  identifier: string | null = displayName ? `${id}/h.io` : null,
): Member {
  return {
    role,
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id, identifier, displayName, avatarUrl: null },
  } as unknown as Member;
}

const names = (members: readonly Member[]) => members.map((m) => m.user.displayName);

describe('groupMembers', () => {
  it('drops deleted accounts, from the list and from the total', () => {
    const result = groupMembers([member('u1', 'Alice'), member('u2', null)], { view: 'alpha' });

    expect(result.total).toBe(1);
    expect(result.matches).toBe(1);
    expect(names(result.sections.flatMap((s) => s.members))).toEqual(['Alice']);
  });

  it('lists everyone in one unlabelled section, sorted by name then identifier, in the alpha view', () => {
    const result = groupMembers(
      [
        member('u3', 'Bob', 'reader', 'z-bob/example.test'),
        member('u1', 'alice', 'space_admin'),
        member('u2', 'Bob', 'member', 'a-bob/example.test'),
      ],
      { view: 'alpha' },
    );

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.role).toBeNull();
    expect(result.sections[0]?.members.map((m) => m.user.identifier)).toEqual([
      'u1/h.io',
      'a-bob/example.test',
      'z-bob/example.test',
    ]);
  });

  it('groups by role in the fixed order and omits empty sections, in the role view', () => {
    const result = groupMembers(
      [
        member('u1', 'Reader', 'reader'),
        member('u2', 'Zed', 'member'),
        member('u3', 'Admin', 'space_admin'),
        member('u4', 'Amy', 'member'),
        member('u5', 'Mod', 'moderator'),
      ],
      { view: 'role' },
    );

    expect(result.sections.map((s) => s.role)).toEqual([
      'space_admin',
      'moderator',
      'member',
      'reader',
    ]);
    expect(names(result.sections[2]?.members ?? [])).toEqual(['Amy', 'Zed']);
  });

  it('keeps room_admin between space_admin and moderator', () => {
    const result = groupMembers(
      [
        member('u1', 'M', 'moderator'),
        member('u2', 'R', 'room_admin'),
        member('u3', 'S', 'space_admin'),
      ],
      { view: 'role' },
    );

    expect(result.sections.map((s) => s.role)).toEqual(['space_admin', 'room_admin', 'moderator']);
  });

  it('searches display names ignoring case and accents', () => {
    const list = [member('u1', 'Élodie'), member('u2', 'Bob'), member('u3', 'Zoé')];

    expect(
      names(groupMembers(list, { query: 'elo', view: 'alpha' }).sections[0]?.members ?? []),
    ).toEqual(['Élodie']);
    expect(
      names(groupMembers(list, { query: 'ZOE', view: 'alpha' }).sections[0]?.members ?? []),
    ).toEqual(['Zoé']);
    expect(
      names(groupMembers(list, { query: 'é', view: 'alpha' }).sections[0]?.members ?? []),
    ).toEqual(['Élodie', 'Zoé']);
  });

  it('searches identifiers too, and matches inside the text', () => {
    const list = [
      member('u1', 'Alice', 'member', 'wonder/example.test'),
      member('u2', 'Bob', 'member', 'builder/example.test'),
    ];

    const result = groupMembers(list, { query: 'onder', view: 'alpha' });

    expect(names(result.sections[0]?.members ?? [])).toEqual(['Alice']);
  });

  it('counts from the filtered list while the total ignores the search', () => {
    const list = [
      member('u1', 'Alice', 'moderator'),
      member('u2', 'Alan', 'member'),
      member('u3', 'Bob', 'member'),
    ];

    const result = groupMembers(list, { query: 'al', view: 'role' });

    expect(result.total).toBe(3);
    expect(result.matches).toBe(2);
    expect(result.sections.map((s) => [s.role, s.members.length])).toEqual([
      ['moderator', 1],
      ['member', 1],
    ]);
  });

  it('returns no section when nothing matches', () => {
    const result = groupMembers([member('u1', 'Alice')], { query: 'zzz', view: 'role' });

    expect(result).toEqual({ total: 1, matches: 0, sections: [] });
  });

  it('ignores a blank search', () => {
    const result = groupMembers([member('u1', 'Alice')], { query: '   ', view: 'alpha' });

    expect(result.matches).toBe(1);
  });
});
