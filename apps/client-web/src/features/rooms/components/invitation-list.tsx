import type { MyRoomInvitation } from '@ekozhq/sdk';
import { useNavigate } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';

import { roomErrorKey } from '@/features/rooms/api/errors';
import {
  useAcceptInvitation,
  useDeclineInvitation,
} from '@/features/rooms/hooks/use-room-mutations';
import { useInvitations } from '@/features/rooms/hooks/use-room-queries';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

const TYPE_KEYS: Record<MyRoomInvitation['room']['type'], ParseKeys> = {
  space: 'rooms.header.type.space',
  channel: 'rooms.header.type.channel',
  dm: 'rooms.header.type.dm',
  group_dm: 'rooms.header.type.groupDm',
};

const ROLE_KEYS: Record<MyRoomInvitation['role'], ParseKeys> = {
  space_admin: 'rooms.invitations.role.spaceAdmin',
  room_admin: 'rooms.invitations.role.roomAdmin',
  moderator: 'rooms.invitations.role.moderator',
  member: 'rooms.invitations.role.member',
  reader: 'rooms.invitations.role.reader',
};

/**
 * `/rooms/invitations`: the caller's pending room invitations (technical design 4.8).
 * Accept opens the room; Decline drops the row. Both mutations refresh the list even
 * on failure, so an invitation answered elsewhere (`409`) leaves it too.
 */
export function InvitationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invitations = useInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const error = accept.error ?? decline.error;
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('rooms.invitations.title')}</h2>
      {invitations.isPending ? (
        <div role="status" aria-label={t('rooms.invitations.loading')} className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : invitations.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('rooms.invitations.error')}</p>
          <Button type="button" variant="outline" onClick={() => void invitations.refetch()}>
            {t('rooms.invitations.retry')}
          </Button>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(roomErrorKey(error))}
            </p>
          )}
          {invitations.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('rooms.invitations.empty')}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {invitations.data.items.map((invitation) => {
                const variables = { invitationId: invitation.id, roomId: invitation.room.id };
                return (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    busy={busy}
                    onAccept={() => {
                      decline.reset();
                      accept.mutate(variables, {
                        onSuccess: () =>
                          void navigate({
                            to: '/rooms/$roomId',
                            params: { roomId: invitation.room.id },
                          }),
                      });
                    }}
                    onDecline={() => {
                      accept.reset();
                      decline.mutate(variables);
                    }}
                  />
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function InvitationRow({
  invitation,
  busy,
  onAccept,
  onDecline,
}: {
  invitation: MyRoomInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { room, invitedBy } = invitation;
  // A deleted account keeps its id but loses its name, identifier and avatar.
  const inviter =
    invitedBy.displayName ?? invitedBy.identifier ?? t('rooms.invitations.deletedAccount');
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(invitation.createdAt),
  );

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <UserAvatar
        userId={invitedBy.id}
        identifier={invitedBy.identifier}
        avatarUrl={invitedBy.avatarUrl}
        displayName={invitedBy.displayName}
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {room.name ?? t('rooms.unnamed')}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t(TYPE_KEYS[room.type])}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t('rooms.invitations.invitedBy', { name: inviter })}
          {invitedBy.identifier && invitedBy.displayName && <span> ({invitedBy.identifier})</span>}
          {' · '}
          {t('rooms.invitations.asRole', { role: t(ROLE_KEYS[invitation.role]) })}
          {' · '}
          {t('rooms.invitations.invitedAt', { date })}
        </p>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={onAccept}>
        {t('rooms.invitations.accept')}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDecline}>
        {t('rooms.invitations.decline')}
      </Button>
    </li>
  );
}
