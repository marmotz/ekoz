import { GroupNameReservedError } from '../conversations.errors.js';

/** Lowercase letters, digits, `_`, `.` and `-`, 1 to 32 characters. */
export const GROUP_NAME_PATTERN = /^[a-z0-9_.-]{1,32}$/;

/** Names a group may not take: they already mean something after an `@`. */
export const RESERVED_GROUP_NAMES: ReadonlySet<string> = new Set([
  'all',
  'space_admin',
  'room_admin',
  'moderator',
  'member',
  'reader',
]);

export function assertGroupNameNotReserved(name: string): void {
  if (RESERVED_GROUP_NAMES.has(name)) {
    throw new GroupNameReservedError();
  }
}

/** Whether `name` collides with a name already used on the room chain. */
export function isNameTaken(name: string, chainNames: Iterable<string>): boolean {
  for (const other of chainNames) {
    if (other === name) {
      return true;
    }
  }

  return false;
}
