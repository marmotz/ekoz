import type { Group, Member } from '@ekozhq/sdk';

import { type ComposerMention, MENTION_ROLES, tokenFor } from '@/features/chat/lib/mention-node';

export const SUGGESTION_LISTBOX_ID = 'mention-suggestions';
export const suggestionOptionId = (key: string) => `mention-option-${key.replace(/\W/g, '-')}`;

export type SuggestionSection = 'people' | 'groups' | 'roles' | 'all';

/** Sections in display order. */
export const SUGGESTION_SECTIONS: readonly SuggestionSection[] = [
  'people',
  'groups',
  'roles',
  'all',
];

export interface MentionSuggestion {
  key: string;
  section: SuggestionSection;
  mention: ComposerMention;
  /** Shown next to the label: the identifier of a person, the member count of a group. */
  hint: string | null;
}

export interface SuggestionSources {
  members: readonly Member[];
  groups: readonly Group[];
  /** `@all`, roles and groups: channels only. */
  allowCollective: boolean;
  roleLabel: (role: string) => string;
  allLabel: string;
}

const LIMITS: Record<SuggestionSection, number> = { people: 8, groups: 5, roles: 5, all: 1 };

/**
 * The entries of the `@` popup for `query` (technical design C1): members, groups,
 * the five roles and `@all`. The filter is case-insensitive on display name,
 * identifier and name. Groups, roles and `@all` are left out where collective
 * mentions are not allowed.
 */
export function buildSuggestions(query: string, sources: SuggestionSources): MentionSuggestion[] {
  const needle = query.trim().toLowerCase();
  const matches = (...values: (string | null)[]) =>
    needle === '' || values.some((value) => value?.toLowerCase().includes(needle));

  const items: MentionSuggestion[] = [];

  for (const { user } of sources.members) {
    if (user.identifier === null || user.displayName === null) continue;
    if (!matches(user.displayName, user.identifier)) continue;
    items.push({
      key: `user:${user.id}`,
      section: 'people',
      hint: user.identifier,
      mention: {
        type: 'user',
        target: user.id,
        token: tokenFor({ type: 'user', identifier: user.identifier }),
        label: user.displayName,
      },
    });
  }

  if (sources.allowCollective) {
    for (const group of sources.groups) {
      if (!matches(group.name)) continue;
      items.push({
        key: `group:${group.id}`,
        section: 'groups',
        hint: String(group.memberCount),
        mention: {
          type: 'group',
          target: group.id,
          token: tokenFor({ type: 'group', name: group.name }),
          label: group.name,
        },
      });
    }

    for (const role of MENTION_ROLES) {
      const label = sources.roleLabel(role);
      if (!matches(role, label)) continue;
      items.push({
        key: `role:${role}`,
        section: 'roles',
        hint: null,
        mention: {
          type: 'role',
          target: role,
          token: tokenFor({ type: 'role', name: role }),
          label,
        },
      });
    }

    if (matches('all', sources.allLabel)) {
      items.push({
        key: 'all',
        section: 'all',
        hint: null,
        mention: {
          type: 'all',
          target: null,
          token: tokenFor({ type: 'all' }),
          label: sources.allLabel,
        },
      });
    }
  }

  const counts: Record<SuggestionSection, number> = { people: 0, groups: 0, roles: 0, all: 0 };
  return items.filter((item) => {
    counts[item.section] += 1;
    return counts[item.section] <= LIMITS[item.section];
  });
}

/** The label a chip shows for a target, used when a body is parsed back into nodes. */
export function labelForMention(
  mention: { type: string; target: string | null; token: string },
  sources: Pick<SuggestionSources, 'members' | 'groups' | 'roleLabel' | 'allLabel'>,
): string {
  switch (mention.type) {
    case 'user':
      return (
        sources.members.find((member) => member.user.id === mention.target)?.user.displayName ??
        mention.token.replace(/^@/, '')
      );
    case 'group':
      return (
        sources.groups.find((group) => group.id === mention.target)?.name ??
        mention.token.replace(/^@/, '')
      );
    case 'role':
      return sources.roleLabel(mention.target ?? '');
    default:
      return sources.allLabel;
  }
}
