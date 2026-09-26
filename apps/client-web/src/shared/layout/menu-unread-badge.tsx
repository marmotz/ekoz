import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { getSidebarSections } from '@/shared/layout/sidebar-section-registry';
import { cn } from '@/shared/lib/utils';
import { useUnreadMentions } from '@/shared/mentions/unread-mentions';

const MAX_SHOWN = 99;

const badgeClass = 'absolute right-0 rounded-full px-1.5 text-[0.65rem] leading-4 font-medium';

function cap(count: number): string {
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
}

/**
 * Calls one section's unread hook and reports the total to the badge. Each hook lives in
 * its own component, so the number of hooks called never changes between renders.
 */
function UnreadCountReporter({
  id,
  useCount,
  onChange,
}: {
  id: string;
  useCount: () => number;
  onChange: (id: string, count: number) => void;
}) {
  const count = useCount();

  useEffect(() => {
    onChange(id, count);
    return () => onChange(id, 0);
  }, [id, count, onChange]);

  return null;
}

/**
 * Unread state on the menu button, same semantics as the rooms tree: a grey badge for
 * unread messages (bottom right), a dark one for unread mentions (top right, filled when
 * one names the caller, outlined when all are collective). Nothing at 0.
 */
export function MenuUnreadBadge() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({});
  const report = useCallback(
    (id: string, count: number) =>
      setCounts((current) => (current[id] === count ? current : { ...current, [id]: count })),
    [],
  );
  const messages = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const items = useUnreadMentions().data?.items ?? [];
  const direct = items.reduce((sum, item) => sum + item.direct, 0);
  const mentions = direct + items.reduce((sum, item) => sum + item.collective, 0);

  return (
    <>
      {getSidebarSections().map(({ id, useUnreadCount }) =>
        useUnreadCount ? (
          <UnreadCountReporter key={id} id={id} useCount={useUnreadCount} onChange={report} />
        ) : null,
      )}
      {mentions > 0 && (
        <span
          role="status"
          data-menu-mention-badge={direct > 0 ? 'direct' : 'collective'}
          aria-label={t(direct > 0 ? 'mentions.badge.direct' : 'mentions.badge.collective', {
            count: mentions,
          })}
          className={cn(
            badgeClass,
            'top-0',
            direct > 0
              ? 'bg-primary text-primary-foreground'
              : 'border border-primary bg-background text-primary',
          )}
        >
          {cap(mentions)}
        </span>
      )}
      {messages > 0 && (
        <span
          role="status"
          data-menu-unread-badge=""
          aria-label={t('rooms.sidebar.unread', { count: messages })}
          className={cn(badgeClass, 'bottom-0 bg-secondary text-secondary-foreground')}
        >
          {cap(messages)}
        </span>
      )}
    </>
  );
}
