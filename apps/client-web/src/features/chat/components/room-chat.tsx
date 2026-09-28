import { useQueryClient } from '@tanstack/react-query';
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { Composer } from '@/features/chat/components/composer';
import { ConnectionBanner } from '@/features/chat/components/connection-banner';
import { DeleteMessageDialog } from '@/features/chat/components/delete-message-dialog';
import { MessageList, type MessageListHandle } from '@/features/chat/components/message-list';
import { PinnedBanner } from '@/features/chat/components/pinned-banner';
import { ReplyBanner } from '@/features/chat/components/reply-banner';
import { TypingLine } from '@/features/chat/components/typing-line';
import {
  MessageActionsContext,
  type MessageActionsValue,
} from '@/features/chat/hooks/message-actions-context';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { useMessageActions } from '@/features/chat/hooks/use-message-actions';
import { useMessagesPolicy } from '@/features/chat/hooks/use-messages-policy';
import { usePins } from '@/features/chat/hooks/use-pins';
import { useReadMarker } from '@/features/chat/hooks/use-read-marker';
import {
  useReadersBySeq,
  useReceiptAudienceSize,
  useReceiptsSync,
} from '@/features/chat/hooks/use-receipts';
import { useSendMessage } from '@/features/chat/hooks/use-send-message';
import { useLoadNewer, useLoadOlder, useTimeline } from '@/features/chat/hooks/use-timeline';
import { useTimelineSync } from '@/features/chat/hooks/use-timeline-sync';
import {
  type ChatMembership,
  type ChatRoom,
  composerBlock,
} from '@/features/chat/lib/composer-state';
import { visiblePins } from '@/features/chat/lib/pins';
import type { Timeline, TimelineMessage } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { setActiveRoom } from '@/shared/realtime/active-room';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

/** How often "Edit" is re-evaluated against the edit window. */
const CLOCK_REFRESH_MS = 30_000;

/** What the route can ask of a chat: bring a message into view (pins panel entries). */
export interface RoomChatHandle {
  /** `seq` spares a lookup when the caller knows it (a pin embeds its message). */
  jumpToMessage: (messageId: string, seq?: string) => void;
}

export interface RoomChatProps {
  ref?: Ref<RoomChatHandle>;
  room: ChatRoom;
  capabilities: readonly string[];
  membership: ChatMembership;
  /** `seq` of a message to open the room at, instead of at the newest message. */
  at?: string | undefined;
  /** Leaves the message the room was opened at: back to the newest messages. */
  onJumpToLatest?: (() => void) | undefined;
  /** Opens the room at a message that is not loaded (the route sets the `at` search param). */
  onJumpToSeq?: ((seq: string) => void) | undefined;
}

/**
 * History, live updates and composer of one room. `room`, `capabilities` and
 * `membership` come from `RoomGate` through the route; nothing about access is
 * fetched here. The timeline lives in the query cache only while this is mounted.
 */
export function RoomChat({
  ref,
  room,
  capabilities,
  membership,
  at,
  onJumpToLatest,
  onJumpToSeq,
}: RoomChatProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const timeline = useTimeline(room.id, at);
  const { loadOlder, state: olderState } = useLoadOlder(room.id);
  const { loadNewer, state: newerState } = useLoadNewer(room.id);
  const { send, retry } = useSendMessage(room.id);
  const sdk = useSdk();
  const myId = useMe().data?.id ?? null;
  const policy = useMessagesPolicy();
  const pins = usePins(room.id, capabilities.includes('room.read'));
  const { toggleReaction, setPinned } = useMessageActions(room.id);
  const listRef = useRef<MessageListHandle>(null);
  const [replyTarget, setReplyTarget] = useState<TimelineMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimelineMessage | null>(null);
  const editDirty = useRef(false);
  const editWindow = policy.data?.editWindow;
  // The edit window is compared with the client clock: keep it moving while there is a window.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (editWindow === null || editWindow === undefined) return undefined;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [editWindow]);
  useTimelineSync(room.id);
  useReceiptsSync(room.id);
  const readers = useReadersBySeq(room.id, timeline.data?.messages);
  const audienceSize = useReceiptAudienceSize(room.id);
  const [atBottom, setAtBottom] = useState(false);
  useReadMarker(room.id, timeline.data, atBottom);

  const authorIds = timeline.data?.messages.map((message) => message.authorId) ?? [];
  const { resolve } = useAuthors(room.id, authorIds);

  const block = composerBlock(room, capabilities, membership);
  const editingMessage = editingId
    ? timeline.data?.messages.find((message) => message.id === editingId)
    : undefined;
  // An edit of a message that was deleted meanwhile is closed, with a notice.
  const editedMessageDeleted = editingMessage?.redactedAt != null;
  const activeEditingId = editingMessage && !editedMessageDeleted ? editingMessage.id : null;
  useEffect(() => {
    if (editedMessageDeleted) toast.info(t('chat.edit.deleted'));
  }, [editedMessageDeleted, t]);

  const latestPin = visiblePins(pins.data)[0];
  const pinnedIds = useMemo(
    () => new Set((pins.data ?? []).map((pin) => pin.messageId)),
    [pins.data],
  );

  /** Leaving the current edit for something else asks first when its draft changed. */
  const leaveEdit = useCallback(() => {
    if (editDirty.current && !window.confirm(t('chat.edit.discard'))) return false;
    editDirty.current = false;
    setEditingId(null);
    return true;
  }, [t]);

  const jumpToMessage = useCallback(
    (messageId: string, knownSeq?: string) => {
      const loaded = queryClient
        .getQueryData<Timeline>(chatKeys.timeline(room.id))
        ?.messages.find((message) => message.id === messageId);
      if (loaded && listRef.current?.scrollToMessage(messageId)) return;

      const seq = knownSeq ?? loaded?.seq;
      if (seq !== undefined) {
        onJumpToSeq?.(seq);
        return;
      }
      if (!sdk) return;
      queryClient
        .fetchQuery({
          queryKey: chatKeys.message(room.id, messageId),
          queryFn: () => sdk.messages.get(room.id, messageId),
          staleTime: Number.POSITIVE_INFINITY,
        })
        .then((message) => onJumpToSeq?.(message.seq))
        .catch(() => toast.info(t('chat.jump.missing')));
    },
    [queryClient, room.id, sdk, onJumpToSeq, t],
  );

  useImperativeHandle(ref, () => ({ jumpToMessage }), [jumpToMessage]);

  const onEditDirtyChange = useCallback((dirty: boolean) => {
    editDirty.current = dirty;
  }, []);

  const actions: MessageActionsValue = {
    roomId: room.id,
    allowCollective: room.type === 'channel',
    myId,
    capabilities,
    canPost: block === null,
    now,
    editWindow,
    pinnedIds,
    editingId: activeEditingId,
    onReply: (message) => {
      if (!leaveEdit()) return;
      setReplyTarget(message);
    },
    onEdit: (message) => {
      if (message.id === editingId) return;
      if (!leaveEdit()) return;
      setEditingId(message.id);
    },
    onDelete: setDeleteTarget,
    onPin: (message) => void setPinned(message.id, true),
    onUnpin: (message) => void setPinned(message.id, false),
    onToggleReaction: (message, emoji) => void toggleReaction(message.id, emoji),
    onEditFinished: () => {
      editDirty.current = false;
      setEditingId(null);
    },
    onEditDirtyChange,
    onJumpToMessage: (messageId) => jumpToMessage(messageId),
  };

  useEffect(() => {
    setActiveRoom(room.id);
    return () => setActiveRoom(null);
  }, [room.id]);

  // Only the mounted chat subscribes to live events, so a cached timeline or receipts of a closed room would go stale.
  useEffect(() => {
    const keys = [chatKeys.timeline(room.id), chatKeys.receipts(room.id)];
    return () => {
      for (const queryKey of keys) queryClient.removeQueries({ queryKey });
    };
  }, [queryClient, room.id]);

  return (
    <MessageActionsContext.Provider value={actions}>
      <section className="flex h-full min-h-0 flex-col">
        <ConnectionBanner />
        {latestPin ? (
          <PinnedBanner
            pin={latestPin}
            onJump={(pin) => jumpToMessage(pin.messageId, pin.message.seq)}
          />
        ) : null}
        {timeline.isError ? (
          <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <p className="text-sm text-muted-foreground">{t('chat.list.error')}</p>
            <Button type="button" variant="outline" onClick={() => void timeline.refetch()}>
              {t('chat.list.retry')}
            </Button>
          </div>
        ) : timeline.data ? (
          <MessageList
            listRef={listRef}
            roomId={room.id}
            timeline={timeline.data}
            resolveAuthor={resolve}
            readersBySeq={readers}
            audienceSize={audienceSize}
            onLoadOlder={() => void loadOlder()}
            olderState={olderState}
            onLoadNewer={() => void loadNewer()}
            newerState={newerState}
            targetSeq={at}
            onRetryPending={(localId) => void retry(localId)}
            onAtBottomChange={setAtBottom}
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
        {replyTarget && block === null ? (
          <ReplyBanner
            target={replyTarget}
            author={resolve(replyTarget.authorId)}
            onCancel={() => setReplyTarget(null)}
          />
        ) : null}
        <TypingLine roomId={room.id} />
        <Composer
          roomId={room.id}
          allowCollective={room.type === 'channel'}
          block={block}
          loading={!timeline.data}
          canAttach={capabilities.includes('room.attach')}
          onTyping={() => sdk?.presence.reporter.notifyTyping(room.id)}
          onSend={(message) => {
            void send(message, replyTarget?.id ?? null);
            setReplyTarget(null);
          }}
        />
        <DeleteMessageDialog message={deleteTarget} onClose={() => setDeleteTarget(null)} />
      </section>
    </MessageActionsContext.Provider>
  );
}
