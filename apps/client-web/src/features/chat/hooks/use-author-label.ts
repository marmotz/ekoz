import type { Author } from '@/features/chat/hooks/use-authors';
import { useTranslation } from '@/shared/i18n/use-translation';

/** The name to show for an author, from their kind. */
export function useAuthorLabel() {
  const { t } = useTranslation();
  return (author: Author) => {
    if (author.kind === 'deleted') return t('chat.message.deletedAccount');
    return author.displayName ?? '';
  };
}
