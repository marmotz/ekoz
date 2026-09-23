import { createFileRoute } from '@tanstack/react-router';

import { RoomChat } from '@/features/chat/components/room-chat';
import { RoomGate } from '@/features/rooms/components/room-gate';

function RoomPage() {
  const { roomId } = Route.useParams();

  return (
    <RoomGate roomId={roomId}>
      {({ room, capabilities, membership }) => (
        <RoomChat key={room.id} room={room} capabilities={capabilities} membership={membership} />
      )}
    </RoomGate>
  );
}

/**
 * The chat of one room. The route composes the two features: `RoomGate`
 * (web-client-rooms) resolves access, `RoomChat` (web-client-chat) renders it.
 * The `_app` layout already wraps every page in `RequireAuth`.
 */
export const Route = createFileRoute('/_app/rooms/$roomId')({
  staticData: { title: 'chat.title' },
  component: RoomPage,
});
