import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { ConversationAvatar } from '@/features/direct-messages/components/conversation-avatar';
import { useConversations } from '@/features/direct-messages/hooks/use-conversations';
import { conversationDisplayName } from '@/features/direct-messages/lib/display-name';
import { NEW_CONVERSATION_PATH } from '@/features/direct-messages/lib/paths';
import { useIsUnseen } from '@/features/direct-messages/lib/unseen-store';
import { useTranslation } from '@/shared/i18n/use-translation';
import type { SidebarSectionProps } from '@/shared/layout/sidebar-section-registry';
import { cn } from '@/shared/lib/utils';
import { useSession } from '@/shared/sdk/session';
import { Skeleton } from '@/shared/ui/skeleton';

/** The conversations section of the sidebar; nothing unless the session is signed in. */
export function SidebarConversations(props: SidebarSectionProps) {
  const { status } = useSession();

  if (status !== 'authenticated') return null;
  return <SidebarConversationsContent {...props} />;
}

function SidebarConversationsContent({ onNavigate }: SidebarSectionProps) {
  const { t } = useTranslation();
  const conversations = useConversations();
  const items = conversations.data?.items ?? [];

  return (
    <section aria-labelledby="sidebar-conversations-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-3">
        <h2
          id="sidebar-conversations-title"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t('directMessages.sidebar.label')}
        </h2>
        <Link
          to={NEW_CONVERSATION_PATH}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Plus className="size-3.5" />
          {t('directMessages.sidebar.new')}
        </Link>
      </div>
      {conversations.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-1 px-3">
          <span className="sr-only">{t('directMessages.sidebar.loading')}</span>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : conversations.isError ? (
        <p className="px-3 text-sm text-destructive">{t('directMessages.sidebar.error')}</p>
      ) : items.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">{t('directMessages.sidebar.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConversationRow({
  conversation,
  onNavigate,
}: {
  conversation: NonNullable<ReturnType<typeof useConversations>['data']>['items'][number];
} & Pick<SidebarSectionProps, 'onNavigate'>) {
  const { t } = useTranslation();
  const unseen = useIsUnseen(conversation.id);
  const name = conversationDisplayName(conversation, t('directMessages.unnamed'));

  return (
    <li>
      <Link
        to="/dms/$roomId"
        params={{ roomId: conversation.id }}
        onClick={onNavigate}
        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        activeProps={{ className: 'bg-accent text-accent-foreground' }}
      >
        <ConversationAvatar conversation={conversation} className="size-6" />
        <span className={cn('min-w-0 flex-1 truncate', unseen && 'font-semibold')}>{name}</span>
        {unseen && (
          <span
            role="status"
            data-unseen-dot=""
            aria-label={t('directMessages.sidebar.unseen')}
            className="size-2 shrink-0 rounded-full bg-primary"
          />
        )}
      </Link>
    </li>
  );
}
