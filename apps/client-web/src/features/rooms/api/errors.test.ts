import { EkozError, NetworkError } from '@ekozhq/sdk';
import { describe, expect, it } from 'vitest';
import { createI18n } from '@/app/i18n';
import { hasRoomErrorCode, ROOM_ERROR_TABLE, roomErrorKey } from '@/features/rooms/api/errors';

describe('roomErrorKey', () => {
  it.each(Object.entries(ROOM_ERROR_TABLE))('maps %s to %s', (code, key) => {
    expect(roomErrorKey(new EkozError({ code, status: 409 }))).toBe(key);
  });

  it('covers every code of the issue', () => {
    expect(Object.keys(ROOM_ERROR_TABLE).sort()).toEqual(
      [
        'room.permission_denied',
        'room.parent_not_found',
        'room.max_depth_exceeded',
        'room.invalid_parent_type',
        'room.not_found',
        'room.already_member',
        'room.banned',
        'room.not_joinable',
        'room.join_request_already_exists',
        'room.join_request_already_resolved',
        'room.invitation_already_resolved',
        'room.invitation_not_found',
        'room.membership_not_found',
      ].sort(),
    );
  });

  it('has an English and a French message for every key', () => {
    const en = createI18n('en');
    const fr = createI18n('fr');

    for (const key of [...Object.values(ROOM_ERROR_TABLE), 'rooms.errors.generic' as const]) {
      expect(en.exists(key, { lng: 'en', fallbackLng: false })).toBe(true);
      expect(fr.exists(key, { lng: 'fr', fallbackLng: false })).toBe(true);
    }
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(roomErrorKey(new EkozError({ code: 'room.unheard_of', status: 400 }))).toBe(
      'rooms.errors.generic',
    );
  });

  it('reports a network failure', () => {
    expect(roomErrorKey(new NetworkError({ code: 'network', status: 0 }))).toBe(
      'rooms.errors.network',
    );
  });

  it('falls back to a generic message for a non-Ekoz error', () => {
    expect(roomErrorKey(new Error('boom'))).toBe('rooms.errors.generic');
    expect(roomErrorKey('boom')).toBe('rooms.errors.generic');
  });
});

describe('hasRoomErrorCode', () => {
  it('matches an SDK error by code only', () => {
    const error = new EkozError({ code: 'room.already_member', status: 409 });

    expect(hasRoomErrorCode(error, 'room.already_member')).toBe(true);
    expect(hasRoomErrorCode(error, 'room.banned')).toBe(false);
    expect(hasRoomErrorCode(new Error('room.already_member'), 'room.already_member')).toBe(false);
  });
});
