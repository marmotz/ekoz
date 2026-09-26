/**
 * Session-only record of the rooms the user is in front of. In memory, so it
 * resets on reload. The chat writes both: the active room is the one mounted,
 * the reading room is the one whose newest message is on screen in a focused
 * window (web-client-read-state technical design C1, C2). Live hooks read them
 * to tell a message the user sees from one they missed.
 */

let activeRoomId: string | null = null;
let readingRoomId: string | null = null;

/** The room the user has open, or `null`. */
export function setActiveRoom(roomId: string | null): void {
  activeRoomId = roomId;
}

export function getActiveRoom(): string | null {
  return activeRoomId;
}

/** The room being read right now (at the bottom, window focused), or `null`. */
export function setReadingRoom(roomId: string | null): void {
  readingRoomId = roomId;
}

export function getReadingRoom(): string | null {
  return readingRoomId;
}

/** Forgets the active and reading rooms (sign-out, tests). */
export function resetActiveRooms(): void {
  activeRoomId = null;
  readingRoomId = null;
}
