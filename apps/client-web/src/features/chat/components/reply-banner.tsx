import { X } from 'lucide-react';

import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import type { Author } from '@/features/chat/hooks/use-authors';
import type { TimelineMessage } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { MessageBody } from '@/shared/messages/message-body';
import { Button } from '@/shared/ui/button';

export interface ReplyBannerProps {
  target: TimelineMessage;
  author: Author;
  onCancel: () => void;
}

/** "Replying to <author>" above the composer, with the parent excerpt and a cancel button. */
export function ReplyBanner({ target, author, onCancel }: ReplyBannerProps) {
  const { t } = useTranslation();
  const label = useAuthorLabel()(author);

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-t bg-muted/40 px-4 py-2 text-sm"
      data-testid="reply-banner"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{t('chat.reply.replyingTo', { name: label })}</p>
        <div className="text-muted-foreground">
          <MessageBody
            body={target.body}
            roomId={target.roomId}
            mentions={target.mentions}
            compact
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t('chat.reply.cancel')}
        onClick={onCancel}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
