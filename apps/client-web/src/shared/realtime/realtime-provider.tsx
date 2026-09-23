import { useEffect, useRef } from 'react';
import { getActiveRoom, markUnseen, resetUnseenRooms } from '@/shared/realtime/unseen-rooms';
import { useRoomEvents } from '@/shared/realtime/use-realtime';
import { useSession } from '@/shared/sdk/session';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * Opens the SDK stream for the signed-in session. The only interpretation it
 * does: a `message_created` from someone else in a room that is not the active
 * one marks that room unseen.
 */
function RealtimeConnection() {
  const sdk = useSdk();
  const me = useMe();
  const meId = useRef<string | undefined>(undefined);
  const currentMeId = me.data?.id;
  useEffect(() => {
    meId.current = currentMeId;
  }, [currentMeId]);

  useEffect(() => {
    if (!sdk) return undefined;
    sdk.stream.connect();
    return () => {
      sdk.stream.disconnect();
      resetUnseenRooms();
    };
  }, [sdk]);

  useRoomEvents(({ roomId, event }) => {
    if (event.type !== 'message_created') return;
    // Until the caller is known, an own message cannot be told from someone else's.
    if (meId.current === undefined || event.senderId === meId.current) return;
    if (roomId === getActiveRoom()) return;
    markUnseen(roomId);
  });

  return null;
}

/**
 * Mounted once in `app/providers`. The stream lives exactly as long as the
 * session is authenticated: leaving that state unmounts the connection, which
 * disconnects and forgets the unseen rooms.
 */
export function RealtimeProvider() {
  const { status } = useSession();
  return status === 'authenticated' ? <RealtimeConnection /> : null;
}
