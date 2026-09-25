import { createFileRoute } from '@tanstack/react-router';

import { RoomGroups } from '@/features/rooms/components/room-groups';

function RoomGroupsPage() {
  const { roomId } = Route.useParams();

  return <RoomGroups roomId={roomId} />;
}

/**
 * Room groups, rendered under the `RoomGate` and `RoomHeader` of `$roomId`, until
 * `web-client-room-settings` mounts the same component in a "Groups" tab.
 */
export const Route = createFileRoute('/_app/rooms/$roomId/groups')({
  staticData: { title: 'rooms.groups.title' },
  component: RoomGroupsPage,
});
