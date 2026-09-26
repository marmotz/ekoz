import type { ConversationListItem, Room } from '@ekozhq/sdk';
import { Link, useNavigate } from '@tanstack/react-router';
import { Settings, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ConfirmDialog } from '@/features/direct-messages/components/confirm-dialog';
import { ConversationAvatar } from '@/features/direct-messages/components/conversation-avatar';
import { useLeaveConversation } from '@/features/direct-messages/hooks/use-conversation-mutations';
import { conversationDisplayName } from '@/features/direct-messages/lib/display-name';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

export interface ConversationHeaderProps {
  room: Room;
  /** The list item, with participants; `null` when only `GET /rooms/:id` knew the conversation. */
  conversation: ConversationListItem | null;
  /** Controls another feature places in the header (the route composes them). */
  actions?: ReactNode;
}

/**
 * Avatar and name of a conversation, plus the other person's identifier for a `dm`. A `dm`
 * offers "Delete the conversation" behind a confirmation (it calls `rooms.leave`); a group
 * links to its settings.
 */
export function ConversationHeader({ room, conversation, actions }: ConversationHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const leave = useLeaveConversation();
  const [confirming, setConfirming] = useState(false);

  const shown = conversation ?? room;
  const name = conversationDisplayName(
    { type: room.type, name: room.name, participants: conversation?.participants },
    room.type === 'dm' ? t('directMessages.direct') : t('directMessages.group'),
  );
  const identifier =
    room.type === 'dm' ? (conversation?.participants[0]?.user.identifier ?? null) : null;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <ConversationAvatar conversation={shown} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold">{name}</h2>
        {identifier && <p className="truncate text-xs text-muted-foreground">{identifier}</p>}
      </div>
      {actions}
      {room.type === 'dm' ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
          <Trash2 />
          {t('directMessages.header.delete')}
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link to="/dms/$roomId/settings" params={{ roomId: room.id }}>
            <Settings />
            {t('directMessages.header.settings')}
          </Link>
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('directMessages.header.deleteConfirm.title')}
        message={t('directMessages.header.deleteConfirm.message')}
        confirmLabel="directMessages.header.deleteConfirm.confirm"
        pending={leave.isPending}
        error={leave.error}
        onConfirm={() =>
          leave.mutate(room.id, {
            onSuccess: () => {
              setConfirming(false);
              void navigate({ to: '/' });
            },
          })
        }
      />
    </header>
  );
}
