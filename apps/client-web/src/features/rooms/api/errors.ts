import { EkozError, NetworkError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';

/** `EkozError.code` to the translation key of its message (technical design 4.7). */
export const ROOM_ERROR_TABLE: Record<string, ParseKeys> = {
  'room.permission_denied': 'rooms.errors.permissionDenied',
  'room.parent_not_found': 'rooms.errors.parentNotFound',
  'room.max_depth_exceeded': 'rooms.errors.maxDepthExceeded',
  'room.invalid_parent_type': 'rooms.errors.invalidParentType',
  'room.not_found': 'rooms.errors.notFound',
  'room.already_member': 'rooms.errors.alreadyMember',
  'room.banned': 'rooms.errors.banned',
  'room.not_joinable': 'rooms.errors.notJoinable',
  'room.join_request_already_exists': 'rooms.errors.joinRequestAlreadyExists',
  'room.join_request_already_resolved': 'rooms.errors.joinRequestAlreadyResolved',
  'room.invitation_already_resolved': 'rooms.errors.invitationAlreadyResolved',
  'room.invitation_not_found': 'rooms.errors.invitationNotFound',
  'room.membership_not_found': 'rooms.errors.membershipNotFound',
};

/** The translation key of the message to show for an error thrown by a rooms SDK call. */
export function roomErrorKey(error: unknown): ParseKeys {
  if (error instanceof NetworkError) return 'rooms.errors.network';
  if (error instanceof EkozError) return ROOM_ERROR_TABLE[error.code] ?? 'rooms.errors.generic';
  return 'rooms.errors.generic';
}

/** Whether `error` is the SDK error with this `code`. */
export function hasRoomErrorCode(error: unknown, code: string): boolean {
  return error instanceof EkozError && error.code === code;
}
