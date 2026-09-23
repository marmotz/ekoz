import { MessageBody } from '@/features/chat/components/message-body';
import type { Author } from '@/features/chat/hooks/use-authors';
import type {
  PendingMessage,
  SendFailureReason,
  TimelineMessage,
} from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { UserAvatar } from '@/shared/ui/user-avatar';

const FAILURE_KEYS = {
  read_only: 'chat.composer.errors.readOnly',
  permission_denied: 'chat.composer.errors.permissionDenied',
  body_too_long: 'chat.composer.errors.bodyTooLong',
  body_invalid: 'chat.composer.errors.bodyInvalid',
  network: 'chat.composer.errors.network',
  unknown: 'chat.composer.errors.generic',
} as const satisfies Record<SendFailureReason, string>;

function useAuthorLabel() {
  const { t } = useTranslation();
  return (author: Author) => {
    if (author.kind === 'deleted') return t('chat.message.deletedAccount');
    if (author.kind === 'unknown') return t('chat.message.unknownUser');
    return author.displayName ?? t('chat.message.unknownUser');
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

export function MessageItem({ message, author }: { message: TimelineMessage; author: Author }) {
  const { t } = useTranslation();
  const label = useAuthorLabel()(author);
  const deleted = message.redactedAt !== null;

  return (
    <li className="flex gap-3 py-1.5" data-message-id={message.id}>
      <UserAvatar
        identifier={author.identifier}
        avatarUrl={author.avatarUrl}
        displayName={author.displayName}
        className="mt-0.5 size-8"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Time iso={message.createdAt} />
          {!deleted && message.editedAt !== null ? (
            <span className="text-xs text-muted-foreground">({t('chat.message.edited')})</span>
          ) : null}
        </div>
        {deleted ? (
          <p className="text-sm italic text-muted-foreground">{t('chat.message.deleted')}</p>
        ) : (
          <MessageBody body={message.body} />
        )}
      </div>
    </li>
  );
}

/** An own message that is still being sent, or that failed and can be retried. */
export function PendingItem({
  pending,
  onRetry,
}: {
  pending: PendingMessage;
  onRetry: (localId: string) => void;
}) {
  const { t } = useTranslation();
  const failed = pending.state === 'failed';

  return (
    <li className="flex gap-3 py-1.5 opacity-70" data-pending-id={pending.localId}>
      <div className="size-8 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <MessageBody body={pending.body} />
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
