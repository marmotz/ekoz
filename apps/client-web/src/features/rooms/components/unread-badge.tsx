import { useTranslation } from '@/shared/i18n/use-translation';

const MAX_SHOWN = 99;

/**
 * Unread messages of a room, in the rooms tree. Nothing for `null` (no membership, no
 * marker possible) or `0`; the number up to 99, then `99+` (the server counts up to 100).
 */
export function UnreadBadge({ count }: { count: number | null }) {
  const { t } = useTranslation();
  if (count === null || count === 0) return null;

  return (
    <span
      role="status"
      data-unread-badge=""
      aria-label={t('rooms.sidebar.unread', { count })}
      className="shrink-0 rounded-full bg-secondary px-1.5 text-[0.65rem] leading-4 font-medium text-secondary-foreground"
    >
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
}
