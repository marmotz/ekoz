import type { ConversationListItem, Room } from '@ekozhq/sdk';
import { Users } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { useDirectPresence } from '@/shared/realtime/use-direct-presence';
import { UserAvatar } from '@/shared/ui/user-avatar';

type Conversation = Room & { participants?: ConversationListItem['participants'] | undefined };

/**
 * The avatar of a conversation: the other person's for a `dm` (with their presence), the
 * first two participants overlapped for a group, a generic badge when nobody is known.
 */
export function ConversationAvatar({
  conversation,
  className,
}: {
  conversation: Conversation;
  className?: string;
}) {
  const presence = useDirectPresence(conversation.id, conversation.type);
  const participants = conversation.participants ?? [];

  if (conversation.type === 'dm' && participants[0]) {
    const { user } = participants[0];
    return (
      <UserAvatar
        userId={user.id}
        identifier={user.identifier}
        avatarUrl={user.avatarUrl}
        displayName={user.displayName}
        presence={presence}
        className={cn('size-8', className)}
      />
    );
  }

  if (conversation.type === 'group_dm' && participants.length > 0) {
    return (
      <span className="flex shrink-0 -space-x-2">
        {participants.slice(0, 2).map(({ user }) => (
          <UserAvatar
            key={user.id}
            userId={user.id}
            identifier={user.identifier}
            avatarUrl={user.avatarUrl}
            displayName={user.displayName}
            className={cn('size-6 ring-2 ring-background', className)}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        className,
      )}
    >
      <Users className="size-4" />
    </span>
  );
}
