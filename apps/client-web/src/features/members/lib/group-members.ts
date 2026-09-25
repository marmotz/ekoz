import type { Member } from '@ekozhq/sdk';

export type MemberRole = Member['role'];
export type MembersView = 'role' | 'alpha';

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
  members: Member[];
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
 * empty sections omitted.
 */
export function groupMembers(
  members: readonly Member[],
  { query = '', view }: { query?: string; view: MembersView },
): GroupedMembers {
  const present = members.filter((member) => member.user.identifier !== null);
  const needle = query.trim();
  const matching = (needle ? present.filter((member) => matchesQuery(member, needle)) : present)
    .slice()
    .sort(byName);

  const sections: MemberSection[] =
    view === 'alpha'
      ? matching.length > 0
        ? [{ role: null, members: matching }]
        : []
      : ROLE_ORDER.map((role) => ({
          role,
          members: matching.filter((member) => member.role === role),
        })).filter((section) => section.members.length > 0);

  return { total: present.length, matches: matching.length, sections };
}
