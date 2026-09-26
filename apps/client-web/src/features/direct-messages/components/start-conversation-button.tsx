import { useNavigate } from '@tanstack/react-router';
import { MessageSquare } from 'lucide-react';

import { conversationErrorKey } from '@/features/direct-messages/api/errors';
import { useCreateDm } from '@/features/direct-messages/hooks/use-conversation-mutations';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

/**
 * Opens the one-to-one conversation with `userId`, creating it when there is none
 * (`POST /dms` is get-or-create). The member profile of `web-client-members` places it.
 */
export function StartConversationButton({
  userId,
  iconOnly = false,
}: {
  userId: string;
  /** Shows only the icon, the label staying as accessible name and tooltip. */
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createDm = useCreateDm();

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? 'icon' : 'sm'}
        title={iconOnly ? t('directMessages.start.button') : undefined}
        aria-label={iconOnly ? t('directMessages.start.button') : undefined}
        variant="outline"
        disabled={createDm.isPending}
        onClick={() =>
          createDm.mutate(userId, {
            onSuccess: (room) => void navigate({ to: '/dms/$roomId', params: { roomId: room.id } }),
          })
        }
      >
        <MessageSquare />
        {iconOnly ? null : t('directMessages.start.button')}
      </Button>
      {createDm.error ? (
        <p role="alert" className="text-xs text-destructive">
          {t(conversationErrorKey(createDm.error))}
        </p>
      ) : null}
    </>
  );
}

/** The icon-only variant the profile card renders through its action registry. */
export function StartConversationIconButton({ userId }: { userId: string }) {
  return <StartConversationButton userId={userId} iconOnly />;
}
