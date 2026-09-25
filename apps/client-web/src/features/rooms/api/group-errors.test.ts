import { EkozError, NetworkError } from '@ekozhq/sdk';
import { expect, it } from 'vitest';

import { groupErrorKey, groupNameProblem } from '@/features/rooms/api/group-errors';

it('accepts the names the server accepts', () => {
  for (const name of ['a', 'design-team', 'ops_2.0', 'x'.repeat(32), '0']) {
    expect(groupNameProblem(name), name).toBeNull();
  }
});

it('rejects names outside the pattern', () => {
  for (const name of ['', 'Design', 'has space', 'x'.repeat(33), 'é', 'a/b', '@ops']) {
    expect(groupNameProblem(name), name).toBe('invalid');
  }
});

it('rejects @all and the role names as reserved', () => {
  for (const name of ['all', 'space_admin', 'room_admin', 'moderator', 'member', 'reader']) {
    expect(groupNameProblem(name), name).toBe('reserved');
  }
});

it('maps the group error codes, then falls back to the room errors', () => {
  const code = (value: string) => new EkozError({ code: value, status: 422 });

  expect(groupErrorKey(code('group.name_reserved'))).toBe('rooms.groups.errors.nameReserved');
  expect(groupErrorKey(code('group.name_taken'))).toBe('rooms.groups.errors.nameTaken');
  expect(groupErrorKey(code('group.member_not_member'))).toBe(
    'rooms.groups.errors.memberNotMember',
  );
  expect(groupErrorKey(code('group.not_found'))).toBe('rooms.groups.errors.notFound');
  expect(groupErrorKey(code('room.permission_denied'))).toBe('rooms.errors.permissionDenied');
  expect(groupErrorKey(code('something.else'))).toBe('rooms.errors.generic');
  expect(groupErrorKey(new NetworkError({ code: 'network_error', status: 0 }))).toBe(
    'rooms.errors.network',
  );
  expect(groupErrorKey(new Error('boom'))).toBe('rooms.errors.generic');
});
