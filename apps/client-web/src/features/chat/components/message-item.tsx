import { Pin } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { MessageEditForm } from '@/features/chat/components/message-edit-form';
import { MessageMenu, type MessageMenuHandlers } from '@/features/chat/components/message-menu';
import { ReactionBar } from '@/features/chat/components/reaction-bar';
import { ReactionPicker } from '@/features/chat/components/reaction-picker';
import { ReadReceipts } from '@/features/chat/components/read-receipts';
import { ReplyQuote } from '@/features/chat/components/reply-quote';
import { useMessageActionsContext } from '@/features/chat/hooks/message-actions-context';
import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import type { Author } from '@/features/chat/hooks/use-authors';
import { availableActions } from '@/features/chat/lib/message-actions';
import type {
  PendingMessage,
  SendFailureReason,
  TimelineMessage,
} from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { MessageBody } from '@/shared/messages/message-body';
import { ProfileCardPopover } from '@/shared/profile/profile-card';
import { useUserPresence } from '@/shared/realtime/own-presence';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

const FAILURE_KEYS = {
  read_only: 'chat.composer.errors.readOnly',
  permission_denied: 'chat.composer.errors.permissionDenied',
  body_too_long: 'chat.composer.errors.bodyTooLong',
  body_invalid: 'chat.composer.errors.bodyInvalid',
  mention_invalid: 'chat.composer.errors.mentionInvalid',
  not_found: 'chat.composer.errors.generic',
  network: 'chat.composer.errors.network',
  unknown: 'chat.composer.errors.generic',
} as const satisfies Record<SendFailureReason, string>;

function Time({ iso }: { iso: string }) {
  const { i18n } = useTranslation();
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={iso} className="text-xs text-muted-foreground">
      {date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}

/**
 * Wraps `children` in a button that opens the author's profile card, for authors
 * who have a profile to show (members and people who left); anything else is
 * rendered as is.
 */
function AuthorCard({
  author,
  children,
  decorative = false,
}: {
  author: Author;
  children: ReactNode;
  /** The avatar duplicates the name button: mouse-only, out of the tab order. */
  decorative?: boolean;
}) {
  if ((author.kind !== 'member' && author.kind !== 'left') || author.identifier === null) {
    return children;
  }

  return (
    <ProfileCardPopover
      userId={author.userId ?? undefined}
      identifier={author.identifier}
      fallback={{ displayName: author.displayName, avatarUrl: author.avatarUrl }}
      role={author.role}
      left={author.kind === 'left'}
    >
      <button
        type="button"
        className="rounded-sm text-left hover:underline focus-visible:outline-2"
        {...(decorative ? { tabIndex: -1, 'aria-hidden': true } : {})}
      >
        {children}
      </button>
    </ProfileCardPopover>
  );
}

/** A text note for someone who left the room; a deleted account already reads as such. */
function AuthorMarker({ kind }: { kind: Author['kind'] }) {
  const { t } = useTranslation();
  if (kind !== 'left') {
    return null;
  }
  return <span className="text-xs text-muted-foreground">({t('members.markers.left')})</span>;
}

export function MessageItem({
  message,
  author,
  readers = [],
  audienceSize,
}: {
  message: TimelineMessage;
  author: Author;
  /** The other members whose read marker sits on this message. */
  readers?: readonly Author[];
  audienceSize?: number | undefined;
}) {
  const { t, i18n } = useTranslation();
  const label = useAuthorLabel()(author);
  const presence = useUserPresence(author.userId);
  const actions = useMessageActionsContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const deleted = message.redactedAt !== null;
  const pinned = !deleted && (actions?.pinnedIds.has(message.id) ?? false);
  const editing = !deleted && actions?.editingId === message.id;
  const canReact = actions?.capabilities.includes('room.react') ?? false;

  const available = actions
    ? availableActions({
        message,
        myId: actions.myId,
        capabilities: actions.capabilities,
        editWindow: actions.editWindow,
        now: actions.now,
        canPost: actions.canPost,
        pinned,
      })
    : [];
  const handlers: MessageMenuHandlers = actions
    ? {
        reply: () => actions.onReply(message),
        react: () => setPickerOpen(true),
        edit: () => actions.onEdit(message),
        pin: () => actions.onPin(message),
        unpin: () => actions.onUnpin(message),
        delete: () => actions.onDelete(message),
      }
    : {};
  const editedAt = message.editedAt === null ? null : new Date(message.editedAt);

  return (
    <MessageMenu actions={available} handlers={handlers}>
      {(moreButton) => (
        <li
          className={cn(
            'group relative flex gap-3 rounded-md py-1.5',
            !deleted && message.mentionsMe === 'direct' && 'bg-primary/15',
            !deleted && message.mentionsMe === 'collective' && 'bg-primary/5',
            // Set on the element by the list after a jump to this message.
            'data-[jump-target]:ring-2 data-[jump-target]:ring-primary',
          )}
          data-message-id={message.id}
          data-mentions-me={deleted ? undefined : (message.mentionsMe ?? undefined)}
        >
          <AuthorCard author={author} decorative>
            <UserAvatar
              userId={author.userId}
              identifier={author.identifier}
              avatarUrl={author.avatarUrl}
              displayName={author.displayName}
              className="mt-0.5 size-8"
              presence={author.kind === 'member' ? presence : undefined}
            />
          </AuthorCard>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {author.kind === 'pending' ? (
                <Skeleton className="h-4 w-24" aria-hidden="true" data-testid="author-pending" />
              ) : (
                <>
                  <AuthorCard author={author}>
                    <span className="text-sm font-medium">{label}</span>
                  </AuthorCard>
                  <AuthorMarker kind={author.kind} />
                </>
              )}
              <Time iso={message.createdAt} />
              {!deleted && editedAt !== null && !Number.isNaN(editedAt.getTime()) ? (
                <time
                  dateTime={message.editedAt ?? undefined}
                  title={t('chat.message.editedAt', {
                    date: editedAt.toLocaleString(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                  className="text-xs text-muted-foreground"
                >
                  ({t('chat.message.edited')})
                </time>
              ) : null}
              {pinned ? (
                <Pin
                  className="size-3 self-center text-muted-foreground"
                  aria-label={t('chat.pins.indicator')}
                  role="img"
                />
              ) : null}
            </div>
            {!deleted && message.replyToId !== null ? (
              <ReplyQuote roomId={message.roomId} replyToId={message.replyToId} />
            ) : null}
            {deleted ? (
              <p className="text-sm italic text-muted-foreground">{t('chat.message.deleted')}</p>
            ) : editing && actions ? (
              <MessageEditForm
                message={message}
                allowCollective={actions.allowCollective}
                onFinished={actions.onEditFinished}
                onDirtyChange={actions.onEditDirtyChange}
              />
            ) : (
              <MessageBody
                body={message.body}
                roomId={message.roomId}
                mentions={message.mentions}
              />
            )}
            {!deleted && actions ? (
              <ReactionBar
                roomId={message.roomId}
                reactions={message.reactions}
                myId={actions.myId}
                canReact={canReact}
                onToggle={(emoji) => actions.onToggleReaction(message, emoji)}
              />
            ) : null}
            <ReadReceipts readers={readers} audienceSize={audienceSize} />
          </div>
          {actions && handlers.react && available.includes('react') ? (
            <ReactionPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onPick={(emoji) => actions.onToggleReaction(message, emoji)}
            />
          ) : null}
          {moreButton}
        </li>
      )}
    </MessageMenu>
  );
}

/** An own message that is still being sent, or that failed and can be retried. */
export function PendingItem({
  pending,
  roomId,
  onRetry,
}: {
  pending: PendingMessage;
  roomId: string;
  onRetry: (localId: string) => void;
}) {
  const { t } = useTranslation();
  const failed = pending.state === 'failed';

  return (
    <li className="flex gap-3 py-1.5 opacity-70" data-pending-id={pending.localId}>
      <div className="size-8 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {pending.replyToId !== null ? (
          <ReplyQuote roomId={roomId} replyToId={pending.replyToId} />
        ) : null}
        <MessageBody body={pending.body} roomId={roomId} mentions={pending.mentions} />
        {failed ? (
          <p
            role="alert"
            className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive"
          >
            <span>{t('chat.message.failed')}</span>
            <span>{t(FAILURE_KEYS[pending.reason ?? 'unknown'])}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry(pending.localId)}
            >
              {t('chat.message.retry')}
            </Button>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t('chat.message.sending')}</p>
        )}
      </div>
    </li>
  );
}
