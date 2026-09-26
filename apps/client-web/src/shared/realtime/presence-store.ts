import type { PresenceStatus, RoomStream } from '@ekozhq/sdk';
import { useSyncExternalStore } from 'react';

/**
 * Session-only record of the presence of other users, fed by the stream's
 * `presence` frames (web-client-presence-and-typing technical design C2). In
 * memory, so it resets on reload. An unknown user is `offline`: the server
 * writes a snapshot of the visible peers each time the stream opens.
 */

const statuses = new Map<string, PresenceStatus>();
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

export function setPresence(userId: string, status: PresenceStatus): void {
  if ((statuses.get(userId) ?? 'offline') === status) return;
  statuses.set(userId, status);
  notify();
}

export function getPresence(userId: string): PresenceStatus {
  return statuses.get(userId) ?? 'offline';
}

/** Forgets every status (reconnection, sign-out, tests). */
export function resetPresence(): void {
  if (statuses.size === 0) return;
  statuses.clear();
  notify();
}

/**
 * Feeds the store from `stream` until the returned cleanup runs. The store is
 * cleared when the stream starts reconnecting: the snapshot of the next
 * connection refills it, and a stale `online` must not outlive the gap.
 */
export function connectPresenceStore(stream: RoomStream): () => void {
  const offPresence = stream.on('presence', ({ userId, status }) => setPresence(userId, status));
  const offStatus = stream.on('status', (status) => {
    if (status === 'reconnecting') resetPresence();
  });

  return () => {
    offPresence();
    offStatus();
    resetPresence();
  };
}

/** The presence of `userId`; `offline` when unknown or when there is no user. */
export function usePresence(userId: string | null | undefined): PresenceStatus {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? getPresence(userId) : 'offline'),
    () => 'offline',
  );
}
