import { useLayoutEffect, useRef } from 'react';

import { MessageItem, PendingItem } from '@/features/chat/components/message-item';
import type { Author } from '@/features/chat/hooks/use-authors';
import type { Timeline } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

/** Distance from the top, in pixels, under which scrolling loads older history. */
const LOAD_OLDER_THRESHOLD = 40;
/** Distance from the bottom under which new messages keep the list pinned to the bottom. */
const STICK_TO_BOTTOM_THRESHOLD = 80;

export interface MessageListProps {
  timeline: Timeline;
  resolveAuthor: (authorId: string | null) => Author;
  onLoadOlder: () => void;
  olderState: 'idle' | 'loading' | 'error';
  onRetryPending: (localId: string) => void;
}

/**
 * The room history, oldest first. Scrolling to the top loads the previous page
 * and keeps the message that was on top in view; new messages keep the list
 * pinned to the bottom unless the user scrolled up.
 */
export function MessageList({
  timeline,
  resolveAuthor,
  onLoadOlder,
  olderState,
  onRetryPending,
}: MessageListProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null);

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
  }, [tail]);

  const loadOlder = () => {
    const element = container.current;
    if (element) anchor.current = { height: element.scrollHeight, top: element.scrollTop };
    onLoadOlder();
  };

  const onScroll = () => {
    const element = container.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_TO_BOTTOM_THRESHOLD;
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
            />
          ))}
          {timeline.pending.map((pending) => (
            <PendingItem key={pending.localId} pending={pending} onRetry={onRetryPending} />
          ))}
        </ol>
      )}
    </div>
  );
}
