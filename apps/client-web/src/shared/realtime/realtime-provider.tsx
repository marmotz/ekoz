import { useEffect } from 'react';
import { resetActiveRooms } from '@/shared/realtime/active-room';
import { useSession } from '@/shared/sdk/session';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * Opens the SDK stream for the signed-in session. It interprets no event: each
 * feature subscribes and updates its own cache.
 */
function RealtimeConnection() {
  const sdk = useSdk();

  useEffect(() => {
    if (!sdk) return undefined;
    sdk.stream.connect();
    return () => {
      sdk.stream.disconnect();
      resetActiveRooms();
    };
  }, [sdk]);

  return null;
}

/**
 * Mounted once in `app/providers`. The stream lives exactly as long as the
 * session is authenticated: leaving that state unmounts the connection, which
 * disconnects and forgets the active and reading rooms.
 */
export function RealtimeProvider() {
  const { status } = useSession();
  return status === 'authenticated' ? <RealtimeConnection /> : null;
}
