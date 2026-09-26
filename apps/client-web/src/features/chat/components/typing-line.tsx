import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useTypingUsers } from '@/shared/realtime/typing-store';

/** Beyond this many people the line stops naming them. */
const MAX_NAMED = 3;

/**
 * Who is typing in the room, between the message list and the composer. The line
 * keeps its height when nobody types, so the list does not jump.
 */
export function TypingLine({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const typingIds = useTypingUsers(roomId);
  const { resolve } = useAuthors(roomId, typingIds);
  const label = useAuthorLabel();

  let text = '';
  if (typingIds.length > MAX_NAMED) {
    text = t('chat.typing.several');
  } else if (typingIds.length > 0) {
    const names = typingIds.map((id) => label(resolve(id)));
    const last = names[names.length - 1] ?? '';
    const rest = names.slice(0, -1).join(', ');
    text =
      names.length === 1
        ? t('chat.typing.one', { name: last })
        : t('chat.typing.many', { names: rest, last });
  }

  return (
    <p aria-live="polite" className="h-5 px-4 text-xs text-muted-foreground">
      {text}
    </p>
  );
}
