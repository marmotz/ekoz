/**
 * What the chat needs to know about a room and the caller's access to it. The
 * route hands these over from `RoomGate` (web-client-rooms), so this feature
 * never fetches them itself (web-client-chat technical design 7.1).
 */
export interface ChatRoom {
  id: string;
  /** `channel` is the only type that accepts `@all`, role and group mentions. */
  type: string;
  readOnly: boolean;
}

/** `member` can write; `invited` and `joinable` can read the history but not write. */
export type ChatMembership = 'member' | 'invited' | 'joinable';

export type ComposerBlock = 'join' | 'read_only' | 'permission';

/**
 * Why the composer is disabled, or `null` when the caller can post. Mirrors the
 * server rule of `POST /rooms/:id/messages`: `room.post`, and the room not
 * read-only unless the caller has `room.edit_any`. Membership matters because a
 * pending invitation or a public room can grant capabilities to someone who has
 * not joined.
 */
export function composerBlock(
  room: ChatRoom,
  capabilities: readonly string[],
  membership: ChatMembership,
): ComposerBlock | null {
  if (membership !== 'member') return 'join';
  if (!capabilities.includes('room.post')) return 'permission';
  if (room.readOnly && !capabilities.includes('room.edit_any')) return 'read_only';
  return null;
}
