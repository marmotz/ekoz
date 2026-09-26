import type { MessagePin } from '@ekozhq/sdk';
import { Pin } from 'lucide-react';

import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { firstLinePreview } from '@/features/chat/lib/pins';
import { useTranslation } from '@/shared/i18n/use-translation';
import { MessageBody } from '@/shared/messages/message-body';

export interface PinnedBannerProps {
  /** The latest visible pin of the room. */
  pin: MessagePin;
  /** Brings the pinned message into view. */
  onJump: (pin: MessagePin) => void;
}

/** The latest pinned message, small, between the room header and the messages. */
export function PinnedBanner({ pin, onJump }: PinnedBannerProps) {
  const { t } = useTranslation();
  const label = useAuthorLabel();
  const { resolve } = useAuthors(pin.message.roomId, [pin.message.authorId]);
  const author = resolve(pin.message.authorId);

  return (
    <button
      type="button"
      data-testid="pinned-banner"
      aria-label={t('chat.pins.banner')}
      className="flex w-full items-center gap-2 border-b bg-muted/40 px-4 py-1.5 text-left text-sm hover:bg-muted/70"
      onClick={() => onJump(pin)}
    >
      <Pin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0 text-xs font-medium">
        {author.kind === 'pending' ? '…' : label(author)}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        <MessageBody
          body={firstLinePreview(pin.message.body)}
          roomId={pin.message.roomId}
          mentions={pin.message.mentions}
          compact
          singleLine
        />
      </span>
    </button>
  );
}
