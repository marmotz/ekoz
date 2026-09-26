import { useNavigate } from '@tanstack/react-router';

import { useConversationsLive } from '@/features/direct-messages/hooks/use-conversations-live';
import { useTranslation } from '@/shared/i18n/use-translation';
import { toast } from '@/shared/ui/sonner';

/**
 * Keeps the conversations list live and leaves a conversation that was deleted, or that
 * the caller was removed from, while it is open: a toast, then back to the home page.
 * Renders nothing; mounted by the `_app` layout, inside `RequireAuth`.
 */
export function ConversationsLive() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useConversationsLive({
    onGone: (reason) => {
      toast(
        t(reason === 'deleted' ? 'directMessages.gone.deleted' : 'directMessages.gone.removed'),
      );
      void navigate({ to: '/' });
    },
  });

  return null;
}
