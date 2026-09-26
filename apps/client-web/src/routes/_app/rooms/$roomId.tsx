import { createFileRoute, Outlet, useChildMatches, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { PinsPanel } from '@/features/chat/components/pins-panel';
import { PinsToggle } from '@/features/chat/components/pins-toggle';
import { RoomChat, type RoomChatHandle } from '@/features/chat/components/room-chat';
import { MembersPanel } from '@/features/members/components/members-panel';
import { MembersToggle } from '@/features/members/components/members-toggle';
import { RoomGate } from '@/features/rooms/components/room-gate';
import { RoomHeader } from '@/features/rooms/components/room-header';
import { useGroupsLive } from '@/shared/groups/use-groups-live';
import { useMembersLive } from '@/shared/members/use-members-live';

/** `at`: the `seq` of a message to open the room at, a decimal string (or the number a hand-typed URL gives). */
// The router merges the result over the raw search, so an invalid value must be overridden explicitly.
export function validateRoomSearch(search: Record<string, unknown>): { at?: string | undefined } {
  const { at } = search;
  const value = typeof at === 'number' && Number.isSafeInteger(at) ? String(at) : at;
  return { at: typeof value === 'string' && /^\d+$/.test(value) ? value : undefined };
}

function RoomPage() {
  const { roomId } = Route.useParams();
  const { at } = Route.useSearch();
  const navigate = useNavigate();
  const hasChildPage = useChildMatches().length > 0;
  const chatRef = useRef<RoomChatHandle>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  useMembersLive(roomId);
  useGroupsLive(roomId);

  return (
    <RoomGate roomId={roomId}>
      {({ room, capabilities, membership }) => {
        const hasMembers = room.type === 'space' || room.type === 'channel';
        const canRead = capabilities.includes('room.read');

        return (
          <>
            <RoomHeader
              room={room}
              capabilities={capabilities}
              actions={
                <>
                  {hasChildPage ? null : (
                    <PinsToggle
                      roomId={room.id}
                      enabled={canRead}
                      open={pinsOpen}
                      onToggle={() => setPinsOpen((open) => !open)}
                    />
                  )}
                  {hasMembers ? <MembersToggle roomId={room.id} /> : null}
                </>
              }
            />
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {hasChildPage ? (
                  <Outlet />
                ) : (
                  <RoomChat
                    ref={chatRef}
                    key={`${room.id}:${at ?? ''}`}
                    room={room}
                    capabilities={capabilities}
                    membership={membership}
                    at={at}
                    onJumpToSeq={(seq) =>
                      void navigate({
                        to: '/rooms/$roomId',
                        params: { roomId: room.id },
                        search: { at: seq },
                      })
                    }
                    onJumpToLatest={() =>
                      void navigate({
                        to: '/rooms/$roomId',
                        params: { roomId: room.id },
                        search: {},
                      })
                    }
                  />
                )}
              </div>
              {hasMembers ? <MembersPanel roomId={room.id} /> : null}
            </div>
            <PinsPanel
              roomId={room.id}
              enabled={canRead}
              open={pinsOpen && !hasChildPage}
              onOpenChange={setPinsOpen}
              onSelect={(pin) => chatRef.current?.jumpToMessage(pin.messageId, pin.message.seq)}
            />
          </>
        );
      }}
    </RoomGate>
  );
}

/**
 * One room. The route composes the features: `RoomGate` (web-client-rooms)
 * resolves access and `RoomHeader` shows the room, `RoomChat` (web-client-chat)
 * renders its content, and the members toggle and panel (web-client-members) sit in
 * the header and beside the content of a space or channel. A child page
 * (`/rooms/$roomId/requests`) replaces the chat under the same gate, header and panel. The `_app` layout already wraps every page in
 * `RequireAuth`.
 */
export const Route = createFileRoute('/_app/rooms/$roomId')({
  staticData: { title: 'chat.title' },
  validateSearch: validateRoomSearch,
  component: RoomPage,
});
