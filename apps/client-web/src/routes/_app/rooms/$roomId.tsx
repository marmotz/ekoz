import { createFileRoute, Outlet, useChildMatches } from '@tanstack/react-router';

import { RoomChat } from '@/features/chat/components/room-chat';
import { RoomGate } from '@/features/rooms/components/room-gate';
import { RoomHeader } from '@/features/rooms/components/room-header';

function RoomPage() {
  const { roomId } = Route.useParams();
  const hasChildPage = useChildMatches().length > 0;

  return (
    <RoomGate roomId={roomId}>
      {({ room, capabilities, membership }) => (
        <>
          <RoomHeader room={room} capabilities={capabilities} />
          <div className="flex min-h-0 flex-1 flex-col">
            {hasChildPage ? (
              <Outlet />
            ) : (
              <RoomChat
                key={room.id}
                room={room}
                capabilities={capabilities}
                membership={membership}
              />
            )}
          </div>
        </>
      )}
    </RoomGate>
  );
}

/**
 * One room. The route composes the two features: `RoomGate` (web-client-rooms)
 * resolves access and `RoomHeader` shows the room, `RoomChat` (web-client-chat)
 * renders its content. A child page (`/rooms/$roomId/requests`) replaces the chat
 * under the same gate and header. The `_app` layout already wraps every page in
 * `RequireAuth`.
 */
export const Route = createFileRoute('/_app/rooms/$roomId')({
  staticData: { title: 'chat.title' },
  component: RoomPage,
});
