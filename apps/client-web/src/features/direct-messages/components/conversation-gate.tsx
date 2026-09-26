import type { ConversationListItem, Room } from '@ekozhq/sdk';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useConversationAccess } from '@/features/direct-messages/hooks/use-conversation-access';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export interface ConversationAccess {
  room: Room;
  /** The list item, with participants; `null` when only `GET /rooms/:id` knew the conversation. */
  conversation: ConversationListItem | null;
  capabilities: readonly string[];
}

export interface ConversationGateProps {
  roomId: string;
  /** The conversation content; rendered only while the conversation is readable. */
  children: (access: ConversationAccess) => ReactNode;
}

/**
 * The single place where access to a conversation is resolved (technical design 4.4):
 * loading and error states like `RoomGate`, and a neutral "conversation not available"
 * for a `403` / `404` or a room that is not a conversation.
 */
export function ConversationGate({ roomId, children }: ConversationGateProps) {
  const { t } = useTranslation();
  const access = useConversationAccess(roomId);

  switch (access.status) {
    case 'loading':
      return (
        <div role="status" aria-label={t('directMessages.gate.loading')} className="space-y-3 p-8">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      );
    case 'error':
      return (
        <div role="alert" className="flex flex-col items-center gap-3 p-8">
          <p className="text-sm text-muted-foreground">{t('directMessages.gate.error')}</p>
          <Button type="button" variant="outline" onClick={access.retry}>
            {t('directMessages.gate.retry')}
          </Button>
        </div>
      );
    case 'unavailable':
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-8">
          <h2 className="text-2xl font-bold">{t('directMessages.gate.unavailable.title')}</h2>
          <p className="text-muted-foreground">{t('directMessages.gate.unavailable.message')}</p>
          <Button asChild variant="outline">
            <Link to="/dms/new">{t('directMessages.gate.unavailable.new')}</Link>
          </Button>
        </div>
      );
    case 'ready':
      return (
        <div className="flex h-full min-h-0 flex-col">
          {children({
            room: access.room,
            conversation: access.conversation,
            capabilities: access.capabilities,
          })}
        </div>
      );
  }
}
