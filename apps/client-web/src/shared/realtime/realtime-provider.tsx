import { useEffect, useRef } from 'react';
import { registerUserMenuItem } from '@/shared/layout/user-menu-items';
import { resetActiveRooms } from '@/shared/realtime/active-room';
import { startPresenceActivity } from '@/shared/realtime/presence-activity';
import { PresenceMenuItem } from '@/shared/realtime/presence-menu-item';
import { connectPresenceStore } from '@/shared/realtime/presence-store';
import { connectTypingStore } from '@/shared/realtime/typing-store';
import { useSession } from '@/shared/sdk/session';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';

registerUserMenuItem({ id: 'presence', order: 1, Component: PresenceMenuItem });

/**
 * Opens the SDK stream for the signed-in session, and runs the presence
 * heartbeat with it. Room events are not interpreted here: each feature
 * subscribes and updates its own cache. The presence and typing stores are the
 * exception, being fed by frames that no feature owns.
 */
function RealtimeConnection() {
  const sdk = useSdk();
  const ownUserId = useRef<string | undefined>(undefined);
  const meId = useMe().data?.id;
  useEffect(() => {
    ownUserId.current = meId;
  }, [meId]);

  useEffect(() => {
    if (!sdk) return undefined;
    const stopPresenceStore = connectPresenceStore(sdk.stream);
    const stopTypingStore = connectTypingStore(sdk.stream, () => ownUserId.current);
    sdk.stream.connect();
    const stopActivity = startPresenceActivity(sdk.presence.reporter);
    return () => {
      stopActivity();
      sdk.stream.disconnect();
      stopTypingStore();
      stopPresenceStore();
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
