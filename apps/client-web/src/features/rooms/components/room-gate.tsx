import type { MyRoomInvitation, Room, RoomListItem, RoomPreview } from '@ekozhq/sdk';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { hasRoomErrorCode, roomErrorKey } from '@/features/rooms/api/errors';
import { type RoomMembership, useRoomAccess } from '@/features/rooms/hooks/use-room-access';
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useJoinRoom,
  useRequestToJoin,
} from '@/features/rooms/hooks/use-room-mutations';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export type { RoomMembership };

export interface RoomAccess {
  /** The rooms list item (`member`) or `GET /rooms/:id` (`invited`, `joinable`). */
  room: Room | RoomListItem;
  capabilities: readonly string[];
  membership: RoomMembership;
}

export interface RoomGateProps {
  roomId: string;
  /** The room content; rendered only while it is readable (`member`, `invited`, `joinable`). */
  children: (access: RoomAccess) => ReactNode;
}

/**
 * The single place where access to a room is resolved (technical design 4.6).
 * Readable states render `children`, under an Accept / Decline banner for a pending
 * invitation or a Join banner for a public room. An invite-only room shows its
 * preview and the caller's join request; anything else a neutral "not accessible".
 */
export function RoomGate({ roomId, children }: RoomGateProps) {
  const { t } = useTranslation();
  const access = useRoomAccess(roomId);

  switch (access.status) {
    case 'loading':
      return (
        <div role="status" aria-label={t('rooms.gate.loading')} className="space-y-3 p-8">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      );
    case 'error':
      return (
        <div role="alert" className="flex flex-col items-center gap-3 p-8">
          <p className="text-sm text-muted-foreground">{t('rooms.gate.error')}</p>
          <Button type="button" variant="outline" onClick={access.retry}>
            {t('rooms.gate.retry')}
          </Button>
        </div>
      );
    case 'unavailable':
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-8">
          <h2 className="text-2xl font-bold">{t('rooms.gate.unavailable.title')}</h2>
          <p className="text-muted-foreground">{t('rooms.gate.unavailable.message')}</p>
          <Button asChild variant="outline">
            <Link to="/rooms">{t('rooms.gate.unavailable.back')}</Link>
          </Button>
        </div>
      );
    case 'request':
      return <JoinRequestPanel preview={access.preview} />;
    default:
      return (
        <div className="flex h-full min-h-0 flex-col">
          {access.status === 'invited' && access.invitation && (
            <InvitationBanner room={access.room} invitation={access.invitation} />
          )}
          {access.status === 'joinable' && <JoinBanner room={access.room} />}
          <div className="flex min-h-0 flex-1 flex-col">
            {children({
              room: access.room,
              capabilities: access.capabilities,
              membership: access.status,
            })}
          </div>
        </div>
      );
  }
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-4 py-3 text-sm">
      {children}
    </div>
  );
}

function ErrorText({ error }: { error: unknown }) {
  const { t } = useTranslation();

  return (
    <p role="alert" className="w-full text-sm text-destructive">
      {t(roomErrorKey(error))}
    </p>
  );
}

function InvitationBanner({
  room,
  invitation,
}: {
  room: Room | RoomListItem;
  invitation: MyRoomInvitation;
}) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const variables = { invitationId: invitation.id, roomId: room.id };
  const busy = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;

  return (
    <Banner>
      <p className="flex-1">
        {t('rooms.gate.invited.message', { name: room.name ?? t('rooms.unnamed') })}
      </p>
      <Button type="button" size="sm" disabled={busy} onClick={() => accept.mutate(variables)}>
        {t('rooms.gate.invited.accept')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => decline.mutate(variables)}
      >
        {t('rooms.gate.invited.decline')}
      </Button>
      {error && <ErrorText error={error} />}
    </Banner>
  );
}

function JoinBanner({ room }: { room: Room | RoomListItem }) {
  const { t } = useTranslation();
  const join = useJoinRoom();
  // `room.already_member`: the list was stale; the mutation refreshes it, nothing to show.
  const error =
    join.error && !hasRoomErrorCode(join.error, 'room.already_member') ? join.error : null;

  return (
    <Banner>
      <p className="flex-1">
        {t('rooms.gate.joinable.message', { name: room.name ?? t('rooms.unnamed') })}
      </p>
      <Button
        type="button"
        size="sm"
        disabled={join.isPending}
        onClick={() => join.mutate(room.id)}
      >
        {t('rooms.gate.joinable.join')}
      </Button>
      {error && <ErrorText error={error} />}
    </Banner>
  );
}

function JoinRequestPanel({ preview }: { preview: RoomPreview }) {
  const { t } = useTranslation();
  const request = useRequestToJoin();
  const status = preview.joinRequest?.status;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{preview.name ?? t('rooms.unnamed')}</h2>
      {preview.topic && <p className="text-muted-foreground">{preview.topic}</p>}
      <p className="text-sm">{t('rooms.gate.request.message')}</p>
      {status === 'pending' ? (
        <p role="status" className="text-sm font-medium">
          {t('rooms.gate.request.pending')}
        </p>
      ) : status === 'rejected' ? (
        <p role="status" className="text-sm font-medium text-destructive">
          {t('rooms.gate.request.declined')}
        </p>
      ) : (
        <Button
          type="button"
          disabled={request.isPending}
          onClick={() => request.mutate(preview.id)}
        >
          {t('rooms.gate.request.send')}
        </Button>
      )}
      {request.error && <ErrorText error={request.error} />}
    </div>
  );
}
