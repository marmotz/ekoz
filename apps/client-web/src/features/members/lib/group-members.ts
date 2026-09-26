import type { Member } from '@ekozhq/sdk';

export type MemberRole = Member['role'];
export type MembersView = 'role' | 'alpha' | 'group';

/** Section order of the `role` view. */
export const ROLE_ORDER: readonly MemberRole[] = [
  'space_admin',
  'room_admin',
  'moderator',
  'member',
  'reader',
];

export interface MemberSection {
  /** The role every member of the section has; null for the single `alpha` section. */
  role: MemberRole | null;
  /** The user group of a `group` view section; `'none'` for the members in no group; null otherwise. */
  group: { id: string; name: string } | 'none' | null;
  members: Member[];
}

/** A user group and the ids of its members, as the `group` view needs them. */
export interface GroupMemberIds {
  id: string;
  name: string;
  memberIds: readonly string[];
}

export interface GroupedMembers {
  /** Members left after dropping deleted accounts, whatever the search. */
  total: number;
  /** Members matching the search. */
  matches: number;
  sections: MemberSection[];
}

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Case- and accent-insensitive substring test. */
function includes(haystack: string, needle: string): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (compare(haystack.slice(start, start + needle.length), needle) === 0) return true;
  }
  return false;
}

function matchesQuery(member: Member, query: string): boolean {
  const { displayName, identifier } = member.user;
  return (
    (displayName !== null && includes(displayName, query)) ||
    (identifier !== null && includes(identifier, query))
  );
}

function byName(a: Member, b: Member): number {
  return (
    compare(a.user.displayName ?? '', b.user.displayName ?? '') ||
    compare(a.user.identifier ?? '', b.user.identifier ?? '')
  );
}

/**
 * Prepares the members list for the panel: drops deleted accounts (no identifier),
 * filters by `query` on display name and identifier, sorts by display name then
 * identifier, and, in the `role` view, groups by role in {@link ROLE_ORDER} with
 * empty sections omitted. In the `group` view, one section per group in `groups`
 * (a member of several groups is listed in each), then the members in no group.
 */
export function groupMembers(
  members: readonly Member[],
  {
    query = '',
    view,
    groups = [],
  }: { query?: string; view: MembersView; groups?: readonly GroupMemberIds[] },
): GroupedMembers {
  const present = members.filter((member) => member.user.identifier !== null);
  const needle = query.trim();
  const matching = (needle ? present.filter((member) => matchesQuery(member, needle)) : present)
    .slice()
    .sort(byName);

  let sections: MemberSection[];
  if (view === 'alpha') {
    sections = matching.length > 0 ? [{ role: null, group: null, members: matching }] : [];
  } else if (view === 'group') {
    const inAGroup = new Set(groups.flatMap((group) => group.memberIds));
    sections = [
      ...groups
        .slice()
        .sort((a, b) => compare(a.name, b.name))
        .map((group) => ({
          role: null,
          group: { id: group.id, name: group.name },
          members: matching.filter((member) => group.memberIds.includes(member.user.id)),
        })),
      {
        role: null,
        group: 'none' as const,
        members: matching.filter((m) => !inAGroup.has(m.user.id)),
      },
    ].filter((section) => section.members.length > 0);
  } else {
    sections = ROLE_ORDER.map((role) => ({
      role,
      group: null,
      members: matching.filter((member) => member.role === role),
    })).filter((section) => section.members.length > 0);
  }

  return { total: present.length, matches: matching.length, sections };
}
