import type { RoomStream } from '@ekozhq/sdk';
import { useSyncExternalStore } from 'react';

/**
 * Session-only record of who is typing where, fed by the stream's `typing`
 * frames (web-client-presence-and-typing technical design C5). An entry lasts
 * the frame's `ttl`; a message from that user in that room ends it at once.
 */

const NO_USERS: readonly string[] = [];

/** roomId -> userId -> expiry timer. */
const timers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();
/** Stable snapshots, rebuilt only when a room's set changes. */
const snapshots = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function refresh(roomId: string): void {
  const users = timers.get(roomId);
  if (users && users.size > 0) {
    snapshots.set(roomId, [...users.keys()]);
  } else {
    timers.delete(roomId);
    snapshots.delete(roomId);
  }
  notify();
}

export function clearTyping(roomId: string, userId: string): void {
  const users = timers.get(roomId);
  const timer = users?.get(userId);
  if (!users || timer === undefined) return;
  clearTimeout(timer);
  users.delete(userId);
  refresh(roomId);
}

export function setTyping(roomId: string, userId: string, ttlSeconds: number): void {
  let users = timers.get(roomId);
  if (!users) {
    users = new Map();
    timers.set(roomId, users);
  }
  const previous = users.get(userId);
  if (previous !== undefined) clearTimeout(previous);
  users.set(
    userId,
    setTimeout(() => clearTyping(roomId, userId), ttlSeconds * 1000),
  );
  if (previous === undefined) refresh(roomId);
}

/** Forgets everyone (reconnection, sign-out, tests). */
export function resetTyping(): void {
  for (const users of timers.values()) for (const timer of users.values()) clearTimeout(timer);
  if (timers.size === 0) return;
  timers.clear();
  snapshots.clear();
  notify();
}

/**
 * Feeds the store from `stream` until the returned cleanup runs. `getOwnUserId`
 * is read per frame: the user never sees their own typing. Cleared when the
 * stream starts reconnecting, since the frames of the gap are lost.
 */
export function connectTypingStore(
  stream: RoomStream,
  getOwnUserId: () => string | undefined,
): () => void {
  const offTyping = stream.on('typing', ({ roomId, userId, ttl }) => {
    if (userId === getOwnUserId()) return;
    setTyping(roomId, userId, ttl);
  });
  const offEvent = stream.on('room_event', ({ roomId, event }) => {
    if (event.type === 'message_created' && event.senderId) clearTyping(roomId, event.senderId);
  });
  const offStatus = stream.on('status', (status) => {
    if (status === 'reconnecting') resetTyping();
  });

  return () => {
    offTyping();
    offEvent();
    offStatus();
    resetTyping();
  };
}

/** The users typing in `roomId`, oldest signal first. */
export function useTypingUsers(roomId: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshots.get(roomId) ?? NO_USERS,
    () => NO_USERS,
  );
}

export function useRoomHasTyping(roomId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshots.has(roomId),
    () => false,
  );
}
