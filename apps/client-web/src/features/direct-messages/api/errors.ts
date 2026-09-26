import { EkozError, NetworkError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';

/** `EkozError.code` to the translation key of its message (technical design 4.6). */
export const CONVERSATION_ERROR_TABLE: Record<string, ParseKeys> = {
  'room.permission_denied': 'directMessages.errors.permissionDenied',
  'room.not_found': 'directMessages.errors.notFound',
  'room.membership_not_found': 'directMessages.errors.membershipNotFound',
  'room.user_not_found': 'directMessages.errors.userNotFound',
  'room.group_full': 'directMessages.errors.groupFull',
  'room.dm_self': 'directMessages.errors.dmSelf',
};

/** The translation key of the message to show for an error thrown by a conversations SDK call. */
export function conversationErrorKey(error: unknown): ParseKeys {
  if (error instanceof NetworkError) return 'directMessages.errors.network';
  if (error instanceof EkozError) {
    return CONVERSATION_ERROR_TABLE[error.code] ?? 'directMessages.errors.generic';
  }
  return 'directMessages.errors.generic';
}
