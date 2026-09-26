import { useMessageActionsContext } from '@/features/chat/hooks/message-actions-context';
import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { useMessageLookup } from '@/features/chat/hooks/use-message-lookup';
import { useTranslation } from '@/shared/i18n/use-translation';
import { MessageBody } from '@/shared/messages/message-body';

const QUOTE_CLASS =
  'mb-1 block w-full max-w-full rounded-md border-l-2 border-muted-foreground/40 bg-muted/40 px-2 py-1 text-left';

/**
 * The quote above a reply: the parent's author and a compact rendering of its body. The
 * parent comes from the loaded timeline, else from `messages.get`. A deleted parent reads
 * "Message deleted", a failed lookup "Message unavailable"; neither is clickable. Any
 * other one jumps to the parent.
 */
export function ReplyQuote({ roomId, replyToId }: { roomId: string; replyToId: string }) {
  const { t } = useTranslation();
  const label = useAuthorLabel();
  const actions = useMessageActionsContext();
  const { message: parent, status } = useMessageLookup(roomId, replyToId);
  const { resolve } = useAuthors(roomId, [parent?.authorId ?? null]);

  if (status === 'loading') {
    return <div className={QUOTE_CLASS} aria-busy="true" data-testid="reply-quote-loading" />;
  }
  if (status === 'error' || !parent) {
    return (
      <p
        className={`${QUOTE_CLASS} text-xs italic text-muted-foreground`}
        data-testid="reply-quote"
      >
        {t('chat.reply.unavailable')}
      </p>
    );
  }
  if (parent.redactedAt !== null) {
    return (
      <p
        className={`${QUOTE_CLASS} text-xs italic text-muted-foreground`}
        data-testid="reply-quote"
      >
        {t('chat.reply.deleted')}
      </p>
    );
  }

  const author = resolve(parent.authorId);
  const content = (
    <>
      <span className="block text-xs font-medium">
        {author.kind === 'pending' ? '…' : label(author)}
      </span>
      <span className="block text-muted-foreground">
        <MessageBody body={parent.body} roomId={roomId} mentions={parent.mentions} compact />
      </span>
    </>
  );

  if (!actions) {
    return (
      <div className={QUOTE_CLASS} data-testid="reply-quote">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${QUOTE_CLASS} cursor-pointer hover:bg-muted/70`}
      data-testid="reply-quote"
      aria-label={t('chat.reply.jump')}
      onClick={() => actions.onJumpToMessage(parent.id)}
    >
      {content}
    </button>
  );
}
