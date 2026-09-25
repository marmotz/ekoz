import type { MyMention } from '@ekozhq/sdk';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { useMyMentions } from '@/features/mentions/hooks/use-my-mentions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { useUserSummaries } from '@/shared/members/use-user-summaries';
import { MessageBody } from '@/shared/messages/message-body';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * `/mentions`: the messages that concern the caller, across every room, newest first.
 * Opening one goes to the room, at that message.
 */
export function MyMentionsList() {
  const { t } = useTranslation();
  const mentions = useMyMentions();
  const items = useMemo(
    () => mentions.data?.pages.flatMap((page) => page.items) ?? [],
    [mentions.data],
  );
  const authorIds = useMemo(
    () => [
      ...new Set(items.flatMap((item) => (item.message.authorId ? [item.message.authorId] : []))),
    ],
    [items],
  );
  const authors = useUserSummaries(authorIds);
  const authorName = (authorId: string | null) => {
    if (authorId === null) return t('mentions.list.deletedAccount');
    const summary = authors.data?.find((entry) => entry.id === authorId);
    if (!summary) return authors.isError ? t('mentions.list.deletedAccount') : '';
    return summary.displayName ?? summary.identifier ?? t('mentions.list.deletedAccount');
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
      <h2 className="text-2xl font-bold">{t('mentions.title')}</h2>
      {mentions.isPending ? (
        <div role="status" aria-label={t('mentions.list.loading')} className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : mentions.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('mentions.list.error')}</p>
          <Button type="button" variant="outline" onClick={() => void mentions.refetch()}>
            {t('mentions.list.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mentions.list.empty')}</p>
      ) : (
        <ul aria-label={t('mentions.title')} className="space-y-2">
          {items.map((item) => (
            <MentionItem
              key={item.message.id}
              item={item}
              author={authorName(item.message.authorId)}
            />
          ))}
        </ul>
      )}
      {mentions.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={mentions.isFetchingNextPage}
          onClick={() => void mentions.fetchNextPage()}
        >
          {t('mentions.list.loadMore')}
        </Button>
      )}
    </div>
  );
}

function MentionItem({ item, author }: { item: MyMention; author: string }) {
  const { t, i18n } = useTranslation();
  const { message, room } = item;
  const date = new Date(message.createdAt);
  const time = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        date,
      );
  const roomName = room.name ?? t('rooms.unnamed');
  const direct = item.mentionsMe === 'direct';

  return (
    <li
      data-unread={item.unread ? '' : undefined}
      data-mentions-me={item.mentionsMe}
      className={cn(
        'space-y-2 rounded-md border p-3',
        direct ? 'border-primary/50 bg-primary/10' : 'bg-primary/5',
        item.unread && 'border-l-4 border-l-primary',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Link
          to="/rooms/$roomId"
          params={{ roomId: room.id }}
          search={{ at: message.seq }}
          aria-label={t('mentions.list.open', { room: roomName })}
          className="font-medium text-foreground hover:underline"
        >
          {roomName}
        </Link>
        <span className="text-sm font-medium text-foreground">{author}</span>
        <time dateTime={String(message.createdAt)}>{time}</time>
        <span className="rounded-full border px-1.5">
          {t(direct ? 'mentions.list.direct' : 'mentions.list.collective')}
        </span>
        {item.unread && (
          <span className="rounded-full bg-primary px-1.5 text-primary-foreground">
            {t('mentions.list.unread')}
          </span>
        )}
      </div>
      <MessageBody body={message.body} roomId={room.id} mentions={message.mentions} />
    </li>
  );
}
