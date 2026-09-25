import { Link } from '@tanstack/react-router';
import { AtSign } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import type { SidebarSectionProps } from '@/shared/layout/sidebar-section-registry';
import { totalUnreadMentions, useUnreadMentions } from '@/shared/mentions/unread-mentions';
import { useSession } from '@/shared/sdk/session';

/** The "My mentions" entry of the sidebar, with the total of unread mentions; nothing unless signed in. */
export function SidebarMentions(props: SidebarSectionProps) {
  const { status } = useSession();

  if (status !== 'authenticated') return null;
  return <SidebarMentionsContent {...props} />;
}

function SidebarMentionsContent({ onNavigate }: SidebarSectionProps) {
  const { t } = useTranslation();
  const total = totalUnreadMentions(useUnreadMentions().data);

  return (
    <nav aria-label={t('mentions.sidebar.label')}>
      <Link
        to="/mentions"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        activeProps={{ className: 'bg-accent text-accent-foreground' }}
      >
        <AtSign className="size-4 shrink-0" />
        <span className="flex-1 truncate">{t('mentions.title')}</span>
        {total > 0 && (
          <span
            role="status"
            aria-label={t('mentions.sidebar.unread', { count: total })}
            className="rounded-full bg-primary px-1.5 text-[0.65rem] leading-4 font-medium text-primary-foreground"
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </Link>
    </nav>
  );
}
