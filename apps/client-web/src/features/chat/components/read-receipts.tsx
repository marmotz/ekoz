import type { Author } from '@/features/chat/hooks/use-authors';
import { useTranslation } from '@/shared/i18n/use-translation';
import { UserAvatar } from '@/shared/ui/user-avatar';

/** Avatars drawn before the rest collapse into `+N`. */
const MAX_AVATARS = 5;

/**
 * Who has read up to a message: up to five small avatars and `+N` for the others, with
 * the full list of names as the accessible label. When `audienceSize` (the other current
 * members) have all read it, a single "Read by everyone" line instead. Nothing without readers.
 */
export function ReadReceipts({
  readers,
  audienceSize,
}: {
  readers: readonly Author[];
  audienceSize?: number | undefined;
}) {
  const { t } = useTranslation();
  if (readers.length === 0) return null;

  if (audienceSize !== undefined && readers.length >= audienceSize) {
    return (
      <p data-read-receipts="" className="m-0 mt-1 text-right text-xs text-muted-foreground">
        {t('chat.receipts.everyone')}
      </p>
    );
  }

  const names = readers.map((reader) => reader.displayName ?? '').join(', ');
  const hidden = readers.length - MAX_AVATARS;

  return (
    <fieldset
      data-read-receipts=""
      aria-label={t('chat.receipts.readBy', { names })}
      className="m-0 mt-1 flex min-w-0 items-center justify-end gap-0.5 border-0 p-0"
    >
      {readers.slice(0, MAX_AVATARS).map((reader) => (
        <UserAvatar
          key={reader.userId}
          userId={reader.userId}
          identifier={reader.identifier}
          avatarUrl={reader.avatarUrl}
          displayName={reader.displayName}
          className="size-4"
        />
      ))}
      {hidden > 0 ? (
        <span aria-hidden="true" className="ml-0.5 text-xs text-muted-foreground">
          +{hidden}
        </span>
      ) : null}
    </fieldset>
  );
}
