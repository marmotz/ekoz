import { useSyncExternalStore } from 'react';

/**
 * Session-only record of the rooms that received a message while they were not
 * open. In memory, so it resets on reload (web-client-chat technical design 7.2).
 * `RealtimeProvider` writes it, the chat calls `setActiveRoom`, and the room tree
 * reads `useRoomHasUnseen`.
 */

let unseen: ReadonlySet<string> = new Set();
let activeRoomId: string | null = null;
const listeners = new Set<() => void>();

function publish(next: ReadonlySet<string>) {
  unseen = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The room the user is looking at, or `null`. Opening a room clears its unseen dot. */
export function setActiveRoom(roomId: string | null): void {
  activeRoomId = roomId;
  if (roomId !== null) markSeen(roomId);
}

export function getActiveRoom(): string | null {
  return activeRoomId;
}

export function markUnseen(roomId: string): void {
  if (unseen.has(roomId)) return;
  publish(new Set(unseen).add(roomId));
}

export function markSeen(roomId: string): void {
  if (!unseen.has(roomId)) return;
  const next = new Set(unseen);
  next.delete(roomId);
  publish(next);
}

/** Forgets every unseen room and the active one (sign-out, tests). */
export function resetUnseenRooms(): void {
  activeRoomId = null;
  if (unseen.size > 0) publish(new Set());
}

export function useRoomHasUnseen(roomId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => unseen.has(roomId),
    () => false,
  );
}
