import { useContext, useEffect, useState } from 'react';

import { SdkContext } from '@/shared/sdk/provider';

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

/**
 * `'unknown'` during SSR and until the client-only SDK mounts; then tracks
 * `session:*` events (technical.md §6).
 */
export function useSession(): SessionStatus {
  const sdk = useContext(SdkContext);
  const [status, setStatus] = useState<SessionStatus>('unknown');

  useEffect(() => {
    if (!sdk) return;

    const state = sdk.session.getState();
    setStatus(state ? 'authenticated' : 'anonymous');

    const offAuthenticated = sdk.on('session:authenticated', () => setStatus('authenticated'));
    const offInvalid = sdk.on('session:invalid', () => setStatus('anonymous'));
    const offCleared = sdk.on('session:cleared', () => setStatus('anonymous'));

    return () => {
      offAuthenticated();
      offInvalid();
      offCleared();
    };
  }, [sdk]);

  return status;
}

export function useSdk() {
  return useContext(SdkContext);
}
