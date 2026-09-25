import { EkozError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';
import { roomErrorKey } from '@/features/rooms/api/errors';

/** Group rules the server enforces (web-client-mentions technical design S4), checked client-side too. */
export const GROUP_NAME_PATTERN = /^[a-z0-9_.-]{1,32}$/;
export const RESERVED_GROUP_NAMES: ReadonlySet<string> = new Set([
  'all',
  'space_admin',
  'room_admin',
  'moderator',
  'member',
  'reader',
]);

export type GroupNameProblem = 'invalid' | 'reserved';

/** What is wrong with a group name, or `null` when the server would accept it. */
export function groupNameProblem(name: string): GroupNameProblem | null {
  if (!GROUP_NAME_PATTERN.test(name)) return 'invalid';
  if (RESERVED_GROUP_NAMES.has(name)) return 'reserved';
  return null;
}

export const GROUP_NAME_KEYS = {
  invalid: 'rooms.groups.errors.nameInvalid',
  reserved: 'rooms.groups.errors.nameReserved',
} as const satisfies Record<GroupNameProblem, ParseKeys>;

const GROUP_ERROR_TABLE: Record<string, ParseKeys> = {
  'group.name_reserved': 'rooms.groups.errors.nameReserved',
  'group.name_taken': 'rooms.groups.errors.nameTaken',
  'group.member_not_member': 'rooms.groups.errors.memberNotMember',
  'group.not_found': 'rooms.groups.errors.notFound',
};

/** The translation key of the message to show for an error thrown by a groups SDK call. */
export function groupErrorKey(error: unknown): ParseKeys {
  if (error instanceof EkozError && GROUP_ERROR_TABLE[error.code]) {
    return GROUP_ERROR_TABLE[error.code] as ParseKeys;
  }
  return roomErrorKey(error);
}
