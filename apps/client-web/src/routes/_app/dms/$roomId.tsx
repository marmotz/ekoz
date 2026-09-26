import { createFileRoute, Outlet, useChildMatches } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { PinsPanel } from '@/features/chat/components/pins-panel';
import { PinsToggle } from '@/features/chat/components/pins-toggle';
import { RoomChat, type RoomChatHandle } from '@/features/chat/components/room-chat';
import { ConversationGate } from '@/features/direct-messages/components/conversation-gate';
import { ConversationHeader } from '@/features/direct-messages/components/conversation-header';
import { clearUnseen } from '@/features/direct-messages/lib/unseen-store';

function ConversationPage() {
  const { roomId } = Route.useParams();
  const hasChildPage = useChildMatches().length > 0;
  const chatRef = useRef<RoomChatHandle>(null);
  const [pinsOpen, setPinsOpen] = useState(false);

  // Opening a conversation sees its messages: drop the sidebar dot.
  useEffect(() => {
    clearUnseen(roomId);
  }, [roomId]);

  return (
    <ConversationGate roomId={roomId}>
      {({ room, conversation, capabilities }) => {
        const canRead = capabilities.includes('room.read');

        return (
          <>
            <ConversationHeader
              room={room}
              conversation={conversation}
              actions={
                hasChildPage ? null : (
                  <PinsToggle
                    roomId={room.id}
                    enabled={canRead}
                    open={pinsOpen}
                    onToggle={() => setPinsOpen((open) => !open)}
                  />
                )
              }
            />
            <div className="flex min-h-0 flex-1 flex-col">
              {hasChildPage ? (
                <Outlet />
              ) : (
                <RoomChat
                  ref={chatRef}
                  key={room.id}
                  room={room}
                  capabilities={capabilities}
                  membership="member"
                />
              )}
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
    </ConversationGate>
  );
}

/**
 * One conversation. The route composes the features: `ConversationGate` resolves access and
 * `ConversationHeader` shows the conversation (web-client-direct-messages), `RoomChat`
 * (web-client-chat) renders its messages. The settings page replaces the chat under the same
 * gate and header.
 */
export const Route = createFileRoute('/_app/dms/$roomId')({
  staticData: { title: 'directMessages.title' },
  component: ConversationPage,
});
