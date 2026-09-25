import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { useRoomUnreadMentions } from '@/shared/mentions/unread-mentions';

const MAX_SHOWN = 99;

/**
 * Unread mentions of a room, in the rooms tree: filled when someone mentioned the
 * caller by name (`direct`), outlined when the room only has collective mentions
 * (`@all`, a role or a group). Nothing without unread mentions.
 */
export function MentionBadge({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const { direct, collective } = useRoomUnreadMentions(roomId);
  const count = direct + collective;
  if (count === 0) return null;

  const filled = direct > 0;
  return (
    <span
      role="status"
      data-mention-badge={filled ? 'direct' : 'collective'}
      aria-label={t(filled ? 'mentions.badge.direct' : 'mentions.badge.collective', { count })}
      className={cn(
        'ml-auto shrink-0 rounded-full px-1.5 text-[0.65rem] leading-4 font-medium',
        filled ? 'bg-primary text-primary-foreground' : 'border border-primary text-primary',
      )}
    >
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
}
