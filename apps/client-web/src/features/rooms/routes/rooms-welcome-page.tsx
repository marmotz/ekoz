import { Link } from '@tanstack/react-router';

import { useInvitations, useRooms } from '@/features/rooms/hooks/use-room-queries';
import { DIRECTORY_PATH, INVITATIONS_PATH, NEW_ROOM_PATH } from '@/features/rooms/lib/paths';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMe } from '@/shared/sdk/use-me';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * `/rooms`: the empty state when the caller has no room and no invitation, otherwise
 * a hint to pick a room (technical design 4.3).
 */
export function RoomsWelcomePage() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const invitations = useInvitations();
  const me = useMe();

  if (rooms.isPending || invitations.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-8">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }

  const roomCount = rooms.data?.items.length ?? 0;
  const invitationCount = invitations.data?.items.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('rooms.welcome.title')}</h2>
      {roomCount === 0 && invitationCount === 0 ? (
        <>
          <p className="text-muted-foreground">{t('rooms.welcome.empty')}</p>
          <Button asChild>
            <Link to={DIRECTORY_PATH}>{t('rooms.welcome.openDirectory')}</Link>
          </Button>
          {me.data?.isOwner && (
            <div className="space-y-2">
              <p className="text-muted-foreground">{t('rooms.welcome.createHint')}</p>
              <Button asChild variant="outline">
                <Link to={NEW_ROOM_PATH}>{t('rooms.welcome.create')}</Link>
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {roomCount > 0 && <p className="text-muted-foreground">{t('rooms.welcome.pick')}</p>}
          {invitationCount > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                {t('rooms.welcome.invitations', { count: invitationCount })}
              </p>
              <Button asChild variant="outline">
                <Link to={INVITATIONS_PATH}>{t('rooms.welcome.openInvitations')}</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
