import { describe, expect, it } from 'vitest';
import { GroupNameReservedError } from '../conversations.errors.js';
import {
  assertGroupNameNotReserved,
  GROUP_NAME_PATTERN,
  isNameTaken,
  RESERVED_GROUP_NAMES,
} from './group-name.js';

describe('group names (unit)', () => {
  it.each(['a', 'devs', 'front.end', 'ops_team-2', 'x'.repeat(32)])('accepts %s', (name) => {
    expect(GROUP_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each(['', 'Devs', 'with space', 'slash/name', 'at@', 'x'.repeat(33)])('rejects %j', (name) => {
    expect(GROUP_NAME_PATTERN.test(name)).toBe(false);
  });

  it('reserves `all` and the five role names', () => {
    expect([...RESERVED_GROUP_NAMES].sort()).toEqual([
      'all',
      'member',
      'moderator',
      'reader',
      'room_admin',
      'space_admin',
    ]);
    for (const name of RESERVED_GROUP_NAMES) {
      expect(() => assertGroupNameNotReserved(name)).toThrow(GroupNameReservedError);
    }
    expect(() => assertGroupNameNotReserved('devs')).not.toThrow();
  });

  it('detects a name already used on the chain', () => {
    expect(isNameTaken('devs', ['ops', 'devs'])).toBe(true);
    expect(isNameTaken('devs', ['ops', 'dev'])).toBe(false);
    expect(isNameTaken('devs', [])).toBe(false);
  });
});
