import { createFileRoute } from '@tanstack/react-router';

import { JoinRequestList } from '@/features/rooms/components/join-request-list';

function JoinRequestsPage() {
  const { roomId } = Route.useParams();

  return <JoinRequestList roomId={roomId} />;
}

/** Join request moderation, rendered under the `RoomGate` and `RoomHeader` of `$roomId`. */
export const Route = createFileRoute('/_app/rooms/$roomId/requests')({
  staticData: { title: 'rooms.requests.title' },
  component: JoinRequestsPage,
});
