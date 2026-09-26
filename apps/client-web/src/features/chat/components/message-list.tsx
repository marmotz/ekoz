import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

import { MessageItem, PendingItem } from '@/features/chat/components/message-item';
import type { Author } from '@/features/chat/hooks/use-authors';
import type { Timeline } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/sonner';

/** Distance from the top, in pixels, under which scrolling loads older history. */
const LOAD_OLDER_THRESHOLD = 40;
/** Distance from the bottom, in pixels, under which scrolling loads newer history (detached timeline). */
const LOAD_NEWER_THRESHOLD = 40;
/** How long the jump target stays outlined. */
const FLASH_DURATION_MS = 2500;
/** Distance from the bottom under which new messages keep the list pinned to the bottom. */
const STICK_TO_BOTTOM_THRESHOLD = 80;

/** What a parent can ask of the list. */
export interface MessageListHandle {
  /** Scrolls a loaded message into view and outlines it briefly; false when it is not loaded. */
  scrollToMessage: (messageId: string) => boolean;
}

export interface MessageListProps {
  listRef?: Ref<MessageListHandle> | undefined;
  roomId: string;
  timeline: Timeline;
  resolveAuthor: (authorId: string | null) => Author;
  /** `messageSeq -> userIds` of the members whose read marker sits on that message. */
  readersBySeq?: ReadonlyMap<string, readonly string[]> | undefined;
  /** Other current members: a message read by all of them shows "Read by everyone". */
  audienceSize?: number | undefined;
  onLoadOlder: () => void;
  olderState: 'idle' | 'loading' | 'error';
  onLoadNewer: () => void;
  newerState: 'idle' | 'loading' | 'error';
  /** `seq` of the message to scroll to and outline when the list first shows. */
  targetSeq?: string | undefined;
  onRetryPending: (localId: string) => void;
  /** Called when the list gets pinned to, or leaves, the bottom (newest message on screen). */
  onAtBottomChange?: ((atBottom: boolean) => void) | undefined;
}

/**
 * The room history, oldest first. Scrolling to the top loads the previous page
 * and keeps the message that was on top in view; new messages keep the list
 * pinned to the bottom unless the user scrolled up.
 */
export function MessageList({
  listRef,
  roomId,
  timeline,
  resolveAuthor,
  readersBySeq,
  audienceSize,
  onLoadOlder,
  olderState,
  onLoadNewer,
  newerState,
  targetSeq,
  onRetryPending,
  onAtBottomChange,
}: MessageListProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  // A jump target keeps the list where the target is instead of at the bottom.
  const stickToBottom = useRef(targetSeq === undefined);
  const targetHandled = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const reportedAtBottom = useRef<boolean | undefined>(undefined);
  const onAtBottomChangeRef = useRef(onAtBottomChange);
  useEffect(() => {
    onAtBottomChangeRef.current = onAtBottomChange;
  });

  const reportAtBottom = useCallback((atBottom: boolean) => {
    if (reportedAtBottom.current === atBottom) return;
    reportedAtBottom.current = atBottom;
    onAtBottomChangeRef.current?.(atBottom);
  }, []);

  /** Scrolls to a message row and outlines it (a data attribute: no render is needed). */
  const flash = useCallback((element: Element) => {
    element.scrollIntoView?.({ block: 'center' });
    element.setAttribute('data-jump-target', '');
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => element.removeAttribute('data-jump-target'),
      FLASH_DURATION_MS,
    );
  }, []);

  useImperativeHandle(
    listRef,
    () => ({
      scrollToMessage: (messageId) => {
        const element = container.current?.querySelector(`[data-message-id="${messageId}"]`);
        if (!element) return false;
        flash(element);
        return true;
      },
    }),
    [flash],
  );

  const visible = timeline.messages.filter((message) => message.hiddenAt === null);
  const firstSeq = timeline.messages[0]?.seq;
  const tail = `${timeline.messages.at(-1)?.seq ?? ''}:${timeline.pending.length}`;

  // Older page prepended: keep the previous first message where it was on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `firstSeq` is the trigger.
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || !anchor.current) return;
    element.scrollTop = anchor.current.top + (element.scrollHeight - anchor.current.height);
    anchor.current = null;
  }, [firstSeq]);

  // New message at the bottom (or first render): follow it while the user is at the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tail` is the trigger.
  useLayoutEffect(() => {
    const element = container.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
    reportAtBottom(stickToBottom.current);
  }, [tail, reportAtBottom]);

  // Jump target: scroll it into view once and outline it briefly; say so when it is not there.
  // The outline is a data attribute set on the element, so no render is needed for it.
  // `targetHandled` makes later runs (the list changes) no-ops.
  useLayoutEffect(() => {
    if (targetSeq === undefined || targetHandled.current) return;
    targetHandled.current = true;
    stickToBottom.current = false;
    reportAtBottom(false);

    const target = visible.find((message) => message.seq === targetSeq);
    if (!target) {
      toast.info(t('chat.jump.missing'));
      return;
    }
    const element = container.current?.querySelector(`[data-message-id="${target.id}"]`);
    if (!element) return;
    flash(element);
  }, [targetSeq, visible, t, reportAtBottom, flash]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);
  useEffect(
    () => () => {
      reportedAtBottom.current = undefined;
      onAtBottomChangeRef.current?.(false);
    },
    [],
  );

  const loadOlder = () => {
    const element = container.current;
    if (element) anchor.current = { height: element.scrollHeight, top: element.scrollTop };
    onLoadOlder();
  };

  const onScroll = () => {
    const element = container.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current =
      distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD && !timeline.hasMoreNewer;
    reportAtBottom(stickToBottom.current);
    if (distanceFromBottom <= LOAD_NEWER_THRESHOLD && timeline.hasMoreNewer) onLoadNewer();
    if (element.scrollTop <= LOAD_OLDER_THRESHOLD && timeline.hasMoreOlder) loadOlder();
  };

  const empty = visible.length === 0 && timeline.pending.length === 0;

  return (
    <div ref={container} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
      {timeline.hasMoreOlder ? (
        <div className="flex justify-center py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={olderState === 'loading'}
            onClick={loadOlder}
          >
            {olderState === 'loading'
              ? t('chat.list.loadingOlder')
              : olderState === 'error'
                ? t('chat.list.loadOlderFailed')
                : t('chat.list.loadOlder')}
          </Button>
        </div>
      ) : null}
      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('chat.list.empty')}</p>
      ) : (
        <ol aria-label={t('chat.list.label')}>
          {visible.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              author={resolveAuthor(message.authorId)}
              readers={readersBySeq?.get(message.seq)?.map((userId) => resolveAuthor(userId))}
              audienceSize={audienceSize}
            />
          ))}
          {timeline.pending.map((pending) => (
            <PendingItem
              key={pending.localId}
              pending={pending}
              roomId={roomId}
              onRetry={onRetryPending}
            />
          ))}
        </ol>
      )}
      {timeline.hasMoreNewer ? (
        <div className="flex justify-center py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={newerState === 'loading'}
            onClick={onLoadNewer}
          >
            {newerState === 'loading'
              ? t('chat.list.loadingNewer')
              : newerState === 'error'
                ? t('chat.list.loadNewerFailed')
                : t('chat.list.loadNewer')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
