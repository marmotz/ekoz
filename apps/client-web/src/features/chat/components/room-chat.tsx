import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { Composer } from '@/features/chat/components/composer';
import { ConnectionBanner } from '@/features/chat/components/connection-banner';
import { MessageList } from '@/features/chat/components/message-list';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { useSendMessage } from '@/features/chat/hooks/use-send-message';
import { useLoadNewer, useLoadOlder, useTimeline } from '@/features/chat/hooks/use-timeline';
import { useTimelineSync } from '@/features/chat/hooks/use-timeline-sync';
import {
  type ChatMembership,
  type ChatRoom,
  composerBlock,
} from '@/features/chat/lib/composer-state';
import { useTranslation } from '@/shared/i18n/use-translation';
import { setActiveRoom } from '@/shared/realtime/unseen-rooms';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export interface RoomChatProps {
  room: ChatRoom;
  capabilities: readonly string[];
  membership: ChatMembership;
  /** `seq` of a message to open the room at, instead of at the newest message. */
  at?: string | undefined;
  /** Leaves the message the room was opened at: back to the newest messages. */
  onJumpToLatest?: (() => void) | undefined;
}

/**
 * History, live updates and composer of one room. `room`, `capabilities` and
 * `membership` come from `RoomGate` through the route; nothing about access is
 * fetched here. The timeline lives in the query cache only while this is mounted.
 */
export function RoomChat({ room, capabilities, membership, at, onJumpToLatest }: RoomChatProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const timeline = useTimeline(room.id, at);
  const { loadOlder, state: olderState } = useLoadOlder(room.id);
  const { loadNewer, state: newerState } = useLoadNewer(room.id);
  const { send, retry } = useSendMessage(room.id);
  useTimelineSync(room.id);

  const authorIds = timeline.data?.messages.map((message) => message.authorId) ?? [];
  const { resolve } = useAuthors(room.id, authorIds);

  useEffect(() => {
    setActiveRoom(room.id);
    return () => setActiveRoom(null);
  }, [room.id]);

  // Only the mounted chat subscribes to live events, so a cached timeline of a closed room would go stale.
  useEffect(() => {
    const key = chatKeys.timeline(room.id);
    return () => {
      queryClient.removeQueries({ queryKey: key });
    };
  }, [queryClient, room.id]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConnectionBanner />
      {timeline.isError ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <p className="text-sm text-muted-foreground">{t('chat.list.error')}</p>
          <Button type="button" variant="outline" onClick={() => void timeline.refetch()}>
            {t('chat.list.retry')}
          </Button>
        </div>
      ) : timeline.data ? (
        <MessageList
          roomId={room.id}
          timeline={timeline.data}
          resolveAuthor={resolve}
          onLoadOlder={() => void loadOlder()}
          olderState={olderState}
          onLoadNewer={() => void loadNewer()}
          newerState={newerState}
          targetSeq={at}
          onRetryPending={(localId) => void retry(localId)}
        />
      ) : (
        <div className="flex-1 space-y-3 p-4" role="status" aria-label={t('chat.list.loading')}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      )}
      {timeline.data?.hasMoreNewer && onJumpToLatest ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2 text-sm"
        >
          <span>{t('chat.jump.detached')}</span>
          <Button type="button" size="sm" onClick={onJumpToLatest}>
            {t('chat.jump.latest')}
          </Button>
        </div>
      ) : null}
      <Composer
        roomId={room.id}
        allowCollective={room.type === 'channel'}
        block={composerBlock(room, capabilities, membership)}
        loading={!timeline.data}
        onSend={(message) => void send(message)}
      />
    </section>
  );
}
