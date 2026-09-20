import { useCallback, useSyncExternalStore } from 'react';

import { useSdk } from '@/shared/sdk/use-sdk';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface Session {
  status: SessionStatus;
  identifier: string | null;
  sessionId: string | null;
}

const SESSION_EVENTS = [
  'session:authenticated',
  'session:refreshed',
  'session:invalid',
  'session:cleared',
] as const;

/**
 * Reactive authentication state. `unknown` until the SDK client is up (which
 * includes the whole server render), then `authenticated` / `anonymous`
 * following the SDK `session:*` events.
 */
export function useSession(): Session {
  const sdk = useSdk();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!sdk) return () => {};
      const unsubscribers = SESSION_EVENTS.map((name) => sdk.on(name, onChange));
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
      };
    },
    [sdk],
  );

  // The snapshot is a primitive so React can compare it: `undefined` = unknown,
  // `null` = anonymous, otherwise the session id.
  const sessionId = useSyncExternalStore(
    subscribe,
    () => (sdk ? (sdk.session.getState()?.sessionId ?? null) : undefined),
    () => undefined,
  );

  if (sessionId === undefined) return { status: 'unknown', identifier: null, sessionId: null };
  if (sessionId === null) return { status: 'anonymous', identifier: null, sessionId: null };
  return {
    status: 'authenticated',
    identifier: sdk?.session.getState()?.identifier ?? null,
    sessionId,
  };
}
