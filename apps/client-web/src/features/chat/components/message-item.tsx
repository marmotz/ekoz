import type { ReactNode } from 'react';

import type { Author } from '@/features/chat/hooks/use-authors';
import type {
  PendingMessage,
  SendFailureReason,
  TimelineMessage,
} from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { MessageBody } from '@/shared/messages/message-body';
import { ProfileCardPopover } from '@/shared/profile/profile-card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

const FAILURE_KEYS = {
  read_only: 'chat.composer.errors.readOnly',
  permission_denied: 'chat.composer.errors.permissionDenied',
  body_too_long: 'chat.composer.errors.bodyTooLong',
  body_invalid: 'chat.composer.errors.bodyInvalid',
  mention_invalid: 'chat.composer.errors.mentionInvalid',
  network: 'chat.composer.errors.network',
  unknown: 'chat.composer.errors.generic',
} as const satisfies Record<SendFailureReason, string>;

function useAuthorLabel() {
  const { t } = useTranslation();
  return (author: Author) => {
    if (author.kind === 'deleted') return t('chat.message.deletedAccount');
    return author.displayName ?? '';
  };
}

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

/** 🚪 for someone who left the room, 💀 for a deleted account; nothing otherwise. */
function AuthorMarker({ kind }: { kind: Author['kind'] }) {
  const { t } = useTranslation();
  if (kind === 'left') {
    return (
      <span role="img" aria-label={t('members.markers.left')} title={t('members.markers.left')}>
        🚪
      </span>
    );
  }
  if (kind === 'deleted') {
    return (
      <span
        role="img"
        aria-label={t('members.markers.deleted')}
        title={t('members.markers.deleted')}
      >
        💀
      </span>
    );
  }
  return null;
}

export function MessageItem({ message, author }: { message: TimelineMessage; author: Author }) {
  const { t } = useTranslation();
  const label = useAuthorLabel()(author);
  const deleted = message.redactedAt !== null;

  return (
    <li
      className={cn(
        'flex gap-3 rounded-md py-1.5',
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
          {!deleted && message.editedAt !== null ? (
            <span className="text-xs text-muted-foreground">({t('chat.message.edited')})</span>
          ) : null}
        </div>
        {deleted ? (
          <p className="text-sm italic text-muted-foreground">{t('chat.message.deleted')}</p>
        ) : (
          <MessageBody body={message.body} roomId={message.roomId} mentions={message.mentions} />
        )}
      </div>
    </li>
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
