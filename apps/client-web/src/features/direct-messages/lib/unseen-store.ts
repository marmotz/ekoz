import { useSyncExternalStore } from 'react';

/**
 * Session-only record of the conversations with a message the user has not seen yet
 * (the sidebar dot). In memory, so it resets on reload; `GET /me/conversations`
 * carries no unread count.
 */
const unseen = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version += 1;
  for (const listener of [...listeners]) listener();
}

export function markUnseen(roomId: string): void {
  if (unseen.has(roomId)) return;
  unseen.add(roomId);
  changed();
}

export function clearUnseen(roomId: string): void {
  if (unseen.delete(roomId)) changed();
}

/** Forgets everything (sign-out, tests). */
export function resetUnseen(): void {
  if (unseen.size === 0) return;
  unseen.clear();
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the conversation has a message the user has not seen. */
export function useIsUnseen(roomId: string): boolean {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return unseen.has(roomId);
}
