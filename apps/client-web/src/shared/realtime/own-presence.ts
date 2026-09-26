import type { PresenceStatus } from '@ekozhq/sdk';
import { useCallback, useSyncExternalStore } from 'react';

import { usePresence } from '@/shared/realtime/presence-store';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The signed-in user's own presence, as the server last reported it to this
 * client's heartbeat (`reporter.state`); `undefined` before the first answer.
 */
export function useOwnPresence(): PresenceStatus | undefined {
  const reporter = useSdk()?.presence.reporter;
  const subscribe = useCallback(
    (onChange: () => void) => (reporter ? reporter.on('change', onChange) : () => {}),
    [reporter],
  );

  return useSyncExternalStore(
    subscribe,
    () => reporter?.state?.status,
    () => undefined,
  );
}

/** Whether the user chose to appear away (persisted on the server). */
export function useManualAway(): boolean {
  const reporter = useSdk()?.presence.reporter;
  const subscribe = useCallback(
    (onChange: () => void) => (reporter ? reporter.on('change', onChange) : () => {}),
    [reporter],
  );

  return useSyncExternalStore(
    subscribe,
    () => reporter?.state?.manualAway ?? false,
    () => false,
  );
}

/**
 * The presence to show next to `userId`: the store's for other users, the
 * heartbeat's own state for the signed-in user (the server never sends a user
 * their own status).
 */
export function useUserPresence(userId: string | null | undefined): PresenceStatus {
  const myId = useMe().data?.id;
  const own = useOwnPresence();
  const other = usePresence(userId);

  return userId && userId === myId ? (own ?? 'offline') : other;
}
