import type { ReactNode } from 'react';

export interface RoomAccess {
  room: { id: string; readOnly: boolean };
  capabilities: readonly string[];
  membership: 'member' | 'invited' | 'joinable';
}

/**
 * PLACEHOLDER for the `RoomGate` that `web-client-rooms` owns. The real one
 * resolves `rooms.get` / `rooms.myPermissions` and decides what to show for each
 * access state; until the SDK `rooms` resource exists, this one hands over a
 * writable room the caller is a member of, so the chat can be exercised on a
 * room id. The server still enforces every permission. Replace it, keeping the
 * render-prop contract (web-client-chat technical design 7.1).
 */
export function RoomGate({
  roomId,
  children,
}: {
  roomId: string;
  children: (access: RoomAccess) => ReactNode;
}) {
  return children({
    room: { id: roomId, readOnly: false },
    capabilities: ['room.read', 'room.post'],
    membership: 'member',
  });
}
